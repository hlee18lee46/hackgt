// app/api/games/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export const dynamic = "force-dynamic";

type MongoGame = {
  _id?: any;
  gamePk?: number;
  date: string;            // "YYYY-MM-DD"
  gameDate?: string;       // ISO
  status?: string;         // "Scheduled" | "In Progress" | "Final" | ...
  teams?: { home?: string; away?: string };
  home_RHE?: { R?: number };
  away_RHE?: { R?: number };
  venue?: string;
};

type OutGame = {
  id: string | number;
  gamePk?: number;
  date: string;
  startTime?: string;
  status: "scheduled" | "in_progress" | "final" | string;
  home: { name: string; score?: number };
  away: { name: string; score?: number };
  venue?: string;
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

function normStatus(s?: string): OutGame["status"] {
  const v = (s || "").trim().toLowerCase();
  if (v.startsWith("schedule")) return "scheduled";
  if (v.includes("progress")) return "in_progress";
  if (v === "final" || v.includes("final")) return "final";
  return v || "scheduled";
}

function mapDoc(d: MongoGame): OutGame {
  return {
    id: d.gamePk ?? d._id?.toString?.() ?? Math.random().toString(36).slice(2),
    gamePk: d.gamePk,
    date: d.date,
    startTime: d.gameDate,
    status: normStatus(d.status),
    home: { name: d.teams?.home ?? "Home", score: d.home_RHE?.R },
    away: { name: d.teams?.away ?? "Away", score: d.away_RHE?.R },
    venue: d.venue,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");          // exact day
  const from = searchParams.get("from");          // inclusive
  const to   = searchParams.get("to");            // inclusive

  try {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || "mlb";
    if (!uri) {
      return NextResponse.json({ success: true, games: [] }, { headers: cors() });
    }

    const client = await MongoClient.connect(uri);
    const db = client.db(dbName);
    // your collection looks like "games" inside "mlb" db
    const col = db.collection<MongoGame>("games");

    let docs: MongoGame[] = [];
    if (date) {
      docs = await col.find({ date }).sort({ gameDate: 1 }).toArray();
    } else if (from && to) {
      docs = await col
        .find({ date: { $gte: from, $lte: to } })
        .sort({ date: 1, gameDate: 1 })
        .toArray();
    } else {
      // no params → return empty ok
      await client.close();
      return NextResponse.json({ success: true, games: [] }, { headers: cors() });
    }

    await client.close();

    const games = (docs || []).map(mapDoc);
    return NextResponse.json({ success: true, games }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message ?? "Server error" },
      { status: 500, headers: cors() }
    );
  }
}
