export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

function seasonNY() {
  return Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric" }));
}

/**
 * GET  /api/db/player-stats/:playerId?season=2025
 *  -> returns stored stats (no fetch from MLB here; see PUT/POST flows)
 */
export async function GET(req: Request, ctx: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await ctx.params;
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") ?? seasonNY());
  const pid = Number(playerId);

  console.log("[GET player-stats] pid=%s season=%s typeof pid=%s db=%s",
    pid, season, typeof pid, process.env.MONGODB_DB);

  const db = await getDb();
  const doc = await db.collection("mlb_player_stats").findOne({ playerId: pid, season });

  return NextResponse.json(
    { source: "app-router", success: true, playerId: pid, season, stat: doc?.stat ?? null },
    { headers: CORS }
  );
}


/**
 * PUT /api/db/player-stats/:playerId?season=2025
 * body: { stat?: object }  // optional: if omitted, this handler expects you’ll POST via Python (below)
 *  -> upsert; returns saved doc
 */
export async function PUT(req: Request, ctx: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await ctx.params;
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") ?? seasonNY());
  const pid = Number(playerId);

  // 1) Call MLB directly (this matches what worked in your debug route)
  const mlbUrl = `https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=season&season=${season}&sportId=1`;
  const r = await fetch(mlbUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": "livesports/1.0 (+local)",
      Accept: "application/json",
    },
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    return NextResponse.json(
      { success: false, error: `MLB ${r.status}`, mlbUrl, body },
      { status: 502, headers: CORS }
    );
  }

  const j = await r.json();
  const splits = j?.stats?.[0]?.splits ?? [];
  // Prefer aggregate (no team). If absent, take first split’s stat.
  const agg = splits.find((s: any) => !s?.team && s?.stat)?.stat ?? null;
  const first = splits[0]?.stat ?? null;
  const stat = agg ?? first ?? null;

  if (!stat) {
    return NextResponse.json(
      { success: false, error: "No stat in MLB payload", mlbUrl, rawSplitsLen: splits.length },
      { status: 502, headers: CORS }
    );
  }

  // 2) Upsert into Mongo
  const db = await getDb();
  const now = new Date();
  await db.collection("mlb_player_stats").updateOne(
    { playerId: pid, season },
    { $set: { stat, source: "mlb-statsapi", updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  const doc = await db.collection("mlb_player_stats").findOne({ playerId: pid, season });

  return NextResponse.json(
    { success: true, playerId: pid, season, stat: doc?.stat ?? null },
    { headers: CORS }
  );
}


/**
 * POST /api/db/player-stats/:playerId?season=2025
 * body: { stat: object }   // For your Python script to push the MLB payload directly
 */
export async function POST(req: Request, { params }: { params: { playerId: string } }) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") ?? seasonNY());
  const playerId = Number(params.playerId);
  const { stat } = await req.json();

  if (!playerId || !season || !stat) {
    return NextResponse.json({ success: false, error: "playerId/season/stat required" }, { status: 400, headers: CORS });
  }

  const db = await getDb();
  const now = new Date();
  await db.collection("player_stats").updateOne(
    { playerId, season },
    { $set: { stat, source: "manual", updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  const doc = await db.collection("player_stats").findOne({ playerId, season });
  return NextResponse.json({ success: true, playerId, season, stat: doc?.stat ?? null }, { headers: CORS });
}
