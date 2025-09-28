// app/api/quiz/[gamePk]/latest/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId, type Db } from "mongodb";

// ---- Types ----
type Choice = { label: string };

export interface QuizQuestionDoc {
  _id: ObjectId;
  gamePk: number;
  text: string;
  choices: Choice[];
  correctIndex: number;
  revealAt: Date;
  closesAt: Date;
  createdAt: Date;
  meta?: Record<string, any>;
}

export interface QuizQuestionJSON {
  _id: string; // stringified ObjectId
  gamePk: number;
  text: string;
  choices: Choice[];
  correctIndex: number;
  revealAt: string;
  closesAt: string;
  createdAt: string;
  meta?: Record<string, any>;
}

// ---- CORS ----
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

// ---- Helper: serialize Mongo doc -> JSON safe ----
function toJSON(q: QuizQuestionDoc): QuizQuestionJSON {
  return {
    _id: q._id.toHexString(),
    gamePk: q.gamePk,
    text: q.text,
    choices: q.choices,
    correctIndex: q.correctIndex,
    revealAt: q.revealAt.toISOString(),
    closesAt: q.closesAt.toISOString(),
    createdAt: q.createdAt.toISOString(),
    meta: q.meta ?? {},
  };
}

// ---- Question factory (replace with your smarter generator if desired) ----
async function makeQuestion(db: Db, gamePk: number): Promise<QuizQuestionJSON> {
  const now = Date.now();

  const doc: QuizQuestionDoc = {
    _id: new ObjectId(),
    gamePk,
    text: "What is WHIP?",
    choices: [
      { label: "Walks + Hits per Inning Pitched" },
      { label: "Wins per Inning Pitched" },
      { label: "Wild pitches per Inning" },
      { label: "Walks per 9 innings" },
    ],
    correctIndex: 0,
    revealAt: new Date(now + 5_000),     // reveal answer in 5s
    closesAt: new Date(now + 120_000),   // close voting in 2m
    createdAt: new Date(now),
    meta: {},
  };

  await db.collection<QuizQuestionDoc>("quiz_questions").insertOne(doc);
  return toJSON(doc);
}

// ---- GET /api/quiz/[gamePk]/latest ----
// Returns the most recent *active* question, or auto-creates a new one
// if none active and the last reveal was > 30s ago.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ gamePk: string }> }
) {
  const { gamePk } = await ctx.params; // MUST await in App Router
  const gp = Number(gamePk);
  if (!gp) {
    return NextResponse.json(
      { success: false, error: "bad gamePk" },
      { status: 400, headers: cors() }
    );
  }

  const db = await getDb();
  const col = db.collection<QuizQuestionDoc>("quiz_questions");
  const now = new Date();

  // 1) Try to find an active question (not yet closed)
  let active = await col.findOne(
    { gamePk: gp, closesAt: { $gt: now } },
    { sort: { createdAt: -1 } }
  );

  // 2) If no active, decide whether to create a fresh one
  if (!active) {
    const last = await col.findOne({ gamePk: gp }, { sort: { createdAt: -1 } });
    const lastRevealMs =
      last?.revealAt ? now.getTime() - new Date(last.revealAt).getTime() : Number.POSITIVE_INFINITY;

    // If never asked OR last reveal > 30s ago, seed a new question
    if (!last || lastRevealMs > 30_000) {
      const created = await makeQuestion(db, gp);
      return NextResponse.json({ success: true, question: created }, { headers: cors() });
    }

    // Otherwise, return null so client waits a bit before the next one
    return NextResponse.json({ success: true, question: null }, { headers: cors() });
  }

  // 3) Return active question
  return NextResponse.json(
    { success: true, question: toJSON(active) },
    { headers: cors() }
  );
}
