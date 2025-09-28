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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gamePk = Number(url.searchParams.get("gamePk"));
    if (!gamePk) {
      return NextResponse.json({ success: false, error: "Missing gamePk" }, { status: 400, headers: cors() });
    }

    const db = await getDb();
    const since = new Date(Date.now() - 2 * 60 * 1000); // last 2 minutes

    // Pull votes + quizzes for this game in window
    const votes = await db
      .collection("quiz_votes")
      .find({ gamePk, ts: { $gte: since } })
      .toArray();

    const quizIds = Array.from(new Set(votes.map(v => v.quizId)));
    const quizzes = await db
      .collection("quizzes")
      .find({ _id: { $in: quizIds } })
      .toArray();

    const answerById = new Map<string, string>(
      quizzes.map((q: any) => [String(q._id), String(q.answer)])
    );

    // Tally points
    const points = new Map<string, number>();
    for (const v of votes) {
      const correct = answerById.get(String(v.quizId));
      if (!correct) continue;
      if (String(v.option) === correct) {
        const key = String(v.userName);
        points.set(key, (points.get(key) ?? 0) + 1);
      }
    }

    const top = [...points.entries()]
      .map(([user, score]) => ({ user, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json({ success: true, since: since.toISOString(), top }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "Server error" }, { status: 500, headers: cors() });
  }
}
