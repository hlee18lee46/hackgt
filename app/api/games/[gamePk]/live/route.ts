// app/api/games/[gamePk]/live/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { fetchMlbLive } from "@/lib/mlb";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() {
  return new Response(null, { headers: cors() });
}

const STALE_MS = 10_000; // 10 seconds

export async function GET(_req: Request, ctx: { params: Promise<{ gamePk: string }> }) {
  const { gamePk: gamePkRaw } = await ctx.params;        // ← await it
  const gamePk = Number(gamePkRaw);
  if (!gamePk) {
    return NextResponse.json(
      { success: false, message: "Bad gamePk" },
      { status: 400, headers: cors() }
    );
  }

  const db = await getDb();
  const col = db.collection("games");

  // 1) Read current doc
  let doc = await col.findOne({ gamePk });

  const now = Date.now();
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
  const isStale = !doc || now - updatedAt > STALE_MS;

  // 2) If stale, pull from MLB and upsert
  if (isStale) {
    try {
      const snap = await fetchMlbLive(gamePk);

      const payload = {
        gamePk,
        date:
          doc?.date ??
          (snap.gameDate ? new Date(snap.gameDate).toISOString().slice(0, 10) : null),
        gameDate: snap.gameDate ?? doc?.gameDate ?? null,
        status: snap.status,
        inning: snap.inning,
        inning_desc: snap.inning_desc,
        balls: snap.balls,
        strikes: snap.strikes,
        outs: snap.outs,
        bases: snap.bases,
        batter: snap.batter,
        pitcher: snap.pitcher,
        teams: snap.teams,
        home_RHE: snap.home_RHE,
        away_RHE: snap.away_RHE,
        venue: snap.venue ?? doc?.venue ?? null,
        updatedAt: new Date(),
      };

      await col.updateOne(
        { gamePk },
        { $set: payload, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );

      doc = await col.findOne({ gamePk });
    } catch {
      // swallow fetch errors; fall back to last-known doc
    }
  }

  if (!doc) {
    return NextResponse.json(
      { success: false, message: "Not found" },
      { status: 404, headers: cors() }
    );
  }

  const response = {
    gamePk,
    date: doc.date,
    gameDate: doc.gameDate,
    status: String(doc.status ?? ""),
    inning: doc.inning ?? null,
    inning_desc: doc.inning_desc ?? "—",
    balls: doc.balls ?? 0,
    strikes: doc.strikes ?? 0,
    outs: doc.outs ?? 0,
    bases: doc.bases ?? { "1B": false, "2B": false, "3B": false },
    batter: doc.batter ?? null,
    pitcher: doc.pitcher ?? null,
    teams: doc.teams ?? { home: "", away: "" },
    home_RHE: doc.home_RHE ?? { R: 0, H: 0, E: 0 },
    away_RHE: doc.away_RHE ?? { R: 0, H: 0, E: 0 },
    venue: doc.venue ?? null,
    updatedAt: doc.updatedAt ?? null,
  };

  return NextResponse.json({ success: true, game: response }, { headers: cors() });
}
