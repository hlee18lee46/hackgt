// app/api/quiz/player/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { buildPlayerQuiz } from "@/lib/quiz";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { gamePk, playerId, season, role } = body as {
      gamePk: number; playerId: number; season: number; role?: "batter" | "pitcher";
    };
    if (!gamePk || !playerId || !season) {
      return NextResponse.json({ success: false, error: "Missing params" }, { status: 400, headers: CORS });
    }

    const q = await buildPlayerQuiz(playerId, season, role === "pitcher" ? "pitching" : "hitting");
    if (!q) return NextResponse.json({ success: false, error: "No question produced" }, { status: 404, headers: CORS });

    const db = await getDb();
    const polls = db.collection("polls");
    const now = new Date();

    const doc = {
      gamePk,
      type: "quiz",
      question: q.question,
      choices: q.choices,
      answerIndex: q.answerIndex,
      meta: q.meta ?? {},
      createdAt: now,
      closesAt: new Date(now.getTime() + 3 * 60_000), // optional 3-min auto-close
    };

    const ins = await polls.insertOne(doc as any);
    return NextResponse.json({ success: true, pollId: String(ins.insertedId), poll: doc }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "error" }, { status: 500, headers: CORS });
  }
}
