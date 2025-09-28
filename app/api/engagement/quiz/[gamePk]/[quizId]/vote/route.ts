// app/api/engagement/quiz/[gamePk]/[quizId]/vote/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

type P = { gamePk: string; quizId: string };

function asObjectId(id: string) {
  return /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null;
}

export async function POST(req: Request, ctx: { params: Promise<P> }) {
  const { gamePk, quizId } = await ctx.params;
  const gp = Number(gamePk);
  if (!gp || !quizId) {
    return NextResponse.json({ success: false, error: "bad path" }, { status: 400, headers: cors() });
  }

  const db = await getDb();
  const quizzes = db.collection("quizzes");
  const votes = db.collection("quiz_votes");
  const leaders = db.collection("quiz_leaderboard");

  await Promise.all([
    votes.createIndex({ quizId: 1, name: 1 }, { unique: true }),
    leaders.createIndex({ gamePk: 1, name: 1 }, { unique: true }),
  ]);

  let body: { name?: string; optionIndex?: number } = {};
  try { body = await req.json(); } catch {}
  const name = (body.name ?? "").trim() || "You";
  const optionIndex = Number(body.optionIndex);
  if (!Number.isFinite(optionIndex) || optionIndex < 0) {
    return NextResponse.json({ success: false, error: "bad optionIndex" }, { status: 400, headers: cors() });
  }

  // Load quiz by _id (ObjectId) OR by quizId (string), but always scoped by gamePk
  const oid = asObjectId(quizId);
  const q = await quizzes.findOne(
    oid ? { _id: oid, gamePk: gp } : { quizId, gamePk: gp }
  );
  if (!q) {
    return NextResponse.json({ success: false, error: "quiz not found" }, { status: 404, headers: cors() });
  }

  if (q.expiresAt && Date.now() > new Date(q.expiresAt).getTime()) {
    return NextResponse.json({ success: false, error: "quiz expired" }, { status: 409, headers: cors() });
  }

  const correctIndex: number | null = q.correctIndex ?? null;

  // Record vote (first vote wins; duplicates no-op)
  try {
    await votes.updateOne(
      { quizId: q.quizId ?? String(q._id), name },
      {
        $setOnInsert: {
          quizId: q.quizId ?? String(q._id),
          gamePk: gp,
          name,
          optionIndex,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch {}

  // Score if correct index is known & the choice matches
  let myScore = 0;
  if (Number.isInteger(correctIndex) && correctIndex === optionIndex) {
    const res = await leaders.findOneAndUpdate(
      { gamePk: gp, name },
      { $inc: { score: 1 }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date() } },
      { upsert: true, returnDocument: "after" }
    );
    // driver v4 vs v5 shapes
    myScore = Number((res as any)?.value?.score ?? (res as any)?.score ?? 0);
  } else {
    const cur = await leaders.findOne({ gamePk: gp, name });
    myScore = Number(cur?.score ?? 0);
  }

  return NextResponse.json(
    { success: true, correct: correctIndex === optionIndex, correctIndex, myScore },
    { headers: cors() }
  );
}
