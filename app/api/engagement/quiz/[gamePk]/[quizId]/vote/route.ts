export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

type Params = { params: Promise<{ gamePk: string; quizId: string }> };

type QuizDoc = {
  quizId: string;
  gamePk: number;
  question: string;
  options: string[];
  createdAt?: Date | string;
  revealAt?: Date | string | null;
  expiresAt?: Date | string | null;
  correctIndex?: number | null;
};

type VoteDoc = {
  gamePk: number;
  quizId: string;
  name: string;
  choice: number;
  ts: Date;
  correct?: boolean | null;
};

type ScoreDoc = {
  gamePk: number;
  name: string;
  score: number;
  createdAt: Date;
  updatedAt: Date;
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() {
  return new Response(null, { headers: cors() });
}

export async function POST(req: Request, ctx: Params) {
  try {
    const { gamePk, quizId } = await ctx.params;
    const gamePkNum = Number(gamePk);
    if (!gamePkNum || !quizId) {
      return NextResponse.json(
        { success: false, error: "bad params" },
        { status: 400, headers: cors() }
      );
    }

    const db = await getDb();
    const colQ = db.collection<QuizDoc>("engagement_quizzes");
    const colV = db.collection<VoteDoc>("engagement_votes");
    const colS = db.collection<ScoreDoc>("engagement_scores");

    const quiz = await colQ.findOne({ gamePk: gamePkNum, quizId });
    if (!quiz) {
      return NextResponse.json(
        { success: false, error: "quiz not found" },
        { status: 404, headers: cors() }
      );
    }

    let body: { name?: string; optionIndex?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* fallthrough */
    }

    const rawName = String(body.name ?? "").trim();
    const optionIndex = Number(body.optionIndex);
    if (!rawName || !Number.isInteger(optionIndex)) {
      return NextResponse.json(
        { success: false, error: "name and optionIndex required" },
        { status: 400, headers: cors() }
      );
    }
    if (optionIndex < 0 || optionIndex >= (quiz.options?.length ?? 0)) {
      return NextResponse.json(
        { success: false, error: "invalid option index" },
        { status: 400, headers: cors() }
      );
    }

    // reject votes after expiration
    if (quiz.expiresAt) {
      const exp = new Date(quiz.expiresAt).getTime();
      if (Date.now() > exp) {
        return NextResponse.json(
          { success: false, error: "quiz expired" },
          { status: 400, headers: cors() }
        );
      }
    }

    const now = new Date();
    const hasAnswer = typeof quiz.correctIndex === "number";
    const isCorrect = hasAnswer ? optionIndex === quiz.correctIndex : null;

    // one vote per user per quiz
    await colV.updateOne(
      { gamePk: gamePkNum, quizId, name: rawName },
      { $set: { choice: optionIndex, ts: now, correct: isCorrect } },
      { upsert: true }
    );

    // score update: only when answer is known and vote is correct
    let myScore = 0;
    if (isCorrect === true) {
      await colS.updateOne(
        { gamePk: gamePkNum, name: rawName },
        {
          $inc: { score: 1 },
          $set: { updatedAt: now },
          $setOnInsert: { createdAt: now, score: 0 },
        },
        { upsert: true }
      );
    }
    const sdoc = await colS.findOne({ gamePk: gamePkNum, name: rawName });
    myScore = sdoc?.score ?? 0;

    return NextResponse.json(
      {
        success: true,
        correct: isCorrect === true,
        correctIndex: hasAnswer ? quiz.correctIndex! : null,
        myScore,
      },
      { headers: cors() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "server error" },
      { status: 500, headers: cors() }
    );
  }
}
