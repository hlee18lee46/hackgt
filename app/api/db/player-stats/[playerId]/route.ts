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
export async function GET(req: Request, { params }: { params: { playerId: string } }) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") ?? seasonNY());
  const playerId = Number(params.playerId);
  if (!playerId) return NextResponse.json({ success: false, error: "bad playerId" }, { status: 400, headers: CORS });

  const db = await getDb();
  const doc = await db.collection("player_stats").findOne({ playerId, season });
  return NextResponse.json({ success: true, playerId, season, stat: doc?.stat ?? null }, { headers: CORS });
}

/**
 * PUT /api/db/player-stats/:playerId?season=2025
 * body: { stat?: object }  // optional: if omitted, this handler expects you’ll POST via Python (below)
 *  -> upsert; returns saved doc
 */
export async function PUT(req: Request, { params }: { params: { playerId: string } }) {
  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season") ?? seasonNY());
  const playerId = Number(params.playerId);
  if (!playerId) return NextResponse.json({ success: false, error: "bad playerId" }, { status: 400, headers: CORS });

  const body = await req.json().catch(() => ({}));
  const stat = body?.stat ?? null;

  const db = await getDb();
  const now = new Date();
  await db.collection("player_stats").updateOne(
    { playerId, season },
    { $set: { stat, source: "mlb-statsapi", updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  const doc = await db.collection("player_stats").findOne({ playerId, season });
  return NextResponse.json({ success: true, playerId, season, stat: doc?.stat ?? null }, { headers: CORS });
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
