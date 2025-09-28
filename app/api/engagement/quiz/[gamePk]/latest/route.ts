export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { DEMO_GAMEPK } from "../../demoQuestions";

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

// Demo timings
const REVEAL_MS = 5_000;   // reveal after 5s
const EXPIRE_MS = 120_000; // keep valid for 2m
const ROTATE_MS = 30_000;  // show a new quiz every 30s

export async function GET(_req: Request, ctx: { params: Promise<{ gamePk: string }> }) {
  const { gamePk: raw } = await ctx.params;
  const gamePk = Number(raw);
  if (!gamePk) {
    return NextResponse.json({ success: false, error: "bad gamePk" }, { status: 400, headers: cors() });
  }

  const db = await getDb();
  const quizzes = db.collection("engagement_quizzes");

  const now = new Date();

  // 1) Is there an "active" quiz?
  const active = await quizzes.findOne(
    { gamePk, status: "active" },
    { sort: { createdAt: -1 } }
  );

  // If an active exists and it's not too old, keep showing it
  if (active && active.createdAt && (now.getTime() - new Date(active.createdAt).getTime()) < ROTATE_MS) {
    return NextResponse.json(
      {
        success: true,
        quiz: {
          quizId: active.quizId ?? active._id?.toString(),
          gamePk: active.gamePk,
          question: active.question,
          options: active.options,
          createdAt: active.createdAt,
          revealAt: active.revealAt,
          expiresAt: active.expiresAt,
        },
      },
      { headers: cors() }
    );
  }

  // 2) No valid active, activate the next queued (lowest idx not yet shown)
  let next = await quizzes.findOne(
    { gamePk, status: "queued" },
    { sort: { idx: 1 } }
  );

  // 2b) If nothing queued, wrap around by resetting all to queued, then pick idx 0
  if (!next) {
    // Only loop for our demo game by default; change if you want for every game
    if (gamePk === DEMO_GAMEPK) {
      await quizzes.updateMany({ gamePk }, { $set: { status: "queued", createdAt: null, revealAt: null, expiresAt: null } });
      next = await quizzes.findOne({ gamePk, status: "queued" }, { sort: { idx: 1 } });
    }
  }

  if (!next) {
    // No quizzes available (non-demo game or empty DB)
    return NextResponse.json({ success: true, quiz: null }, { headers: cors() });
  }

  // 3) Activate this quiz
  const createdAt = now;
  const revealAt = new Date(createdAt.getTime() + REVEAL_MS);
  const expiresAt = new Date(createdAt.getTime() + EXPIRE_MS);

  await quizzes.updateOne(
    { _id: next._id },
    { $set: { status: "active", createdAt, revealAt, expiresAt } }
  );

  const quiz = {
    quizId: next.quizId ?? String(next._id),
    gamePk,
    question: next.question,
    options: next.options,
    createdAt,
    revealAt,
    expiresAt,
  };

  return NextResponse.json({ success: true, quiz }, { headers: cors() });
}
