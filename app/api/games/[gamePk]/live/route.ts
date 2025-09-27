// app/api/games/[gamePk]/live/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

export async function GET(_req: Request, { params }: { params: { gamePk: string } }) {
  const gamePk = Number(params.gamePk);
  if (!gamePk) {
    return NextResponse.json({ success:false, message:"Bad gamePk" }, { status:400, headers: cors() });
  }

  const db = await getDb(); // uses your lib/mongodb.ts, db defaults to "mlb"
  // Adjust "games" if your collection name differs
  const doc = await db.collection("games").findOne({ gamePk });

  if (!doc) {
    return NextResponse.json({ success:false, message:"Not found" }, { status:404, headers: cors() });
  }

  const payload = {
    gamePk,
    date: doc.date,
    gameDate: doc.gameDate,
    status: String(doc.status ?? ""),
    inning: doc.inning ?? null,
    inning_desc: doc.inning_desc ?? "",
    balls: doc.balls ?? 0,
    strikes: doc.strikes ?? 0,
    outs: doc.outs ?? 0,
    bases: doc.bases ?? { "1B": false, "2B": false, "3B": false },
    batter: doc.batter ?? null,   // { id, name } if you store it
    pitcher: doc.pitcher ?? null, // { id, name } if you store it
    teams: doc.teams ?? { home: "", away: "" },
    home_RHE: doc.home_RHE ?? { R: 0, H: 0, E: 0 },
    away_RHE: doc.away_RHE ?? { R: 0, H: 0, E: 0 },
    venue: doc.venue ?? null,
    updatedAt: doc.updatedAt ?? null,
  };

  return NextResponse.json({ success:true, game: payload }, { headers: cors() });
}
