// app/api/games/route.ts
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

export const dynamic = "force-dynamic";

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

type Game = {
  id?: string | number;
  gamePk?: number;
  date: string;          // YYYY-MM-DD
  startTime?: string;    // ISO
  status?: string;       // scheduled | in_progress | final
  home?: { name: string; score?: number };
  away?: { name: string; score?: number };
  venue?: string;
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ success: false, message: msg }, { status: code, headers: cors() });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");        // exact day
  const from = searchParams.get("from");        // inclusive
  const to = searchParams.get("to");            // inclusive

  // If no params → return empty list (OK), so mobile UI won’t break
  if (!date && !from && !to) {
    return NextResponse.json({ success: true, games: [] as Game[] }, { headers: cors() });
  }

  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      // No DB? return empty but OK
      return NextResponse.json({ success: true, games: [] as Game[] }, { headers: cors() });
    }

    const client = await MongoClient.connect(uri);
    const db = client.db(process.env.MONGODB_DB || "livesports");
    const col = db.collection<Game>("mlb_games");

    let games: Game[] = [];

    if (date) {
      games = await col.find({ date }).sort({ startTime: 1 }).toArray();
    } else if (from && to) {
      games = await col.find({ date: { $gte: from, $lte: to } }).sort({ date: 1, startTime: 1 }).toArray();
    } else {
      await client.close();
      return bad("Provide ?date=YYYY-MM-DD or ?from=YYYY-MM-DD&to=YYYY-MM-DD");
    }

    await client.close();
    return NextResponse.json({ success: true, games }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message || "Server error" },
      { status: 500, headers: cors() }
    );
  }
}
