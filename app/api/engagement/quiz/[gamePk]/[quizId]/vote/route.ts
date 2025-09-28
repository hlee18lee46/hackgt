export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

/* ---------- CORS helpers ---------- */
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() {
  return new Response(null, { headers: cors() });
}

/* ---------- Local types (self-contained) ---------- */
type VoteBody = { name?: string; optionIndex?: number };

type QuizDoc = {
  _id: ObjectId;
  gamePk: number;
  question: string;
  options: string[];
  correctIndex?: number | null; // set on seed for reveal-able questions
  createdAt?: Date;
  revealAt?: Date | null;
  expiresAt?: Date | null;
};

type ScoreDoc = {
  _id?: ObjectId;            // optional for inserts
  gamePk: number;
  name: string;
  score: number;
  createdAt?: Date;
  updatedAt?: Date;
};

const QUIZ_COL = "eng_quizzes";
const VOTE_COL = "eng_quiz_votes";
const SCORE_COL = "eng_quiz_scores";

function isHex24(id: string) {
  return /^[0-9a-f]{24}$/i.test(id);
}

/* ---------- POST /vote ---------- */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ gamePk: string; quizId: string }> }
) {
  try {
    const { gamePk, quizId } = await ctx.params;
    const gamePkNum = Number(gamePk);

    if (!gamePkNum) {
      return NextResponse.json(
        { success: false, error: "bad gamePk" },
        { status: 400, headers: cors() }
      );
    }

    const body = (await req.json().catch(() => ({}))) as VoteBody;
    const name = String((body.name ?? "").trim());
    const optionIndex = Number(body.optionIndex);

    if (!name) {
      return NextResponse.json(
        { success: false, error: "missing name" },
        { status: 400, headers: cors() }
      );
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0) {
      return NextResponse.json(
        { success: false, error: "invalid optionIndex" },
        { status: 400, headers: cors() }
      );
    }

    const db = await getDb();
    const qCol = db.collection<QuizDoc>(QUIZ_COL);

    // We always send hex quizId from the client; still guard just in case.
    if (!isHex24(quizId)) {
      return NextResponse.json(
        { success: false, error: "quiz not found" },
        { status: 404, headers: cors() }
      );
    }

    const quizDoc = await qCol.findOne({
      _id: new ObjectId(quizId),
      gamePk: gamePkNum,
    });

    if (!quizDoc) {
      return NextResponse.json(
        { success: false, error: "quiz not found" },
        { status: 404, headers: cors() }
      );
    }

    // Bounds check for selected option
    if (optionIndex >= (quizDoc.options?.length ?? 0)) {
      return NextResponse.json(
        { success: false, error: "option out of range" },
        { status: 400, headers: cors() }
      );
    }

    // Check expiration
    const now = Date.now();
    const expiresAtMs = quizDoc.expiresAt
      ? new Date(quizDoc.expiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (now > expiresAtMs) {
      return NextResponse.json(
        { success: false, error: "quiz expired" },
        { status: 400, headers: cors() }
      );
    }

    // Record / update this user's vote (one vote per (quizId,name))
    const vCol = db.collection(VOTE_COL);
    await vCol.updateOne(
      { quizId: quizDoc._id.toHexString(), name },
      {
        $set: {
          gamePk: gamePkNum,
          optionIndex,
          ts: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    // Decide if we can reveal (grade) now
    const revealAtMs = quizDoc.revealAt
      ? new Date(quizDoc.revealAt).getTime()
      : Number.POSITIVE_INFINITY;
    const revealed = now >= revealAtMs && quizDoc.correctIndex != null;

    const sCol = db.collection<ScoreDoc>(SCORE_COL);

let correctIndex: number | null = null;
let correct = false;
let myScore = 0;

if (revealed) {
  correctIndex = quizDoc.correctIndex as number;
  correct = optionIndex === correctIndex;

  if (correct) {
    // Step 1: increment (or create) the user’s score
    await sCol.updateOne(
      { gamePk: gamePkNum, name },
      {
        $inc: { score: 1 },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date(), score: 0 },
      },
      { upsert: true }
    );
  }

  // Step 2: read back current score (works regardless of driver return type)
  const doc = await sCol.findOne({ gamePk: gamePkNum, name });
  myScore = doc?.score ?? 0;
} else {
  // Not revealed yet — don’t change score, just return current value
  const doc = await sCol.findOne({ gamePk: gamePkNum, name });
  myScore = doc?.score ?? 0;
}


    return NextResponse.json(
      { success: true, correct, correctIndex, myScore },
      { headers: cors() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "server error" },
      { status: 500, headers: cors() }
    );
  }
}
