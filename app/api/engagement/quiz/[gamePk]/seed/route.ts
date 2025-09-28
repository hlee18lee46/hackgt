export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { DEMO_GAMEPK, DEMO_QUESTIONS } from "../../demoQuestions";

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

export async function POST(_req: Request, ctx: { params: Promise<{ gamePk: string }> }) {
  const { gamePk: raw } = await ctx.params;
  const gamePk = Number(raw);
  if (!gamePk) {
    return NextResponse.json({ success: false, error: "bad gamePk" }, { status: 400, headers: cors() });
  }

  // For demo, only seed the mock game; change this if you want others to seed too
  if (gamePk !== DEMO_GAMEPK) {
    return NextResponse.json(
      { success: true, seeded: 0, message: "Not a demo gamePk; skipping." },
      { headers: cors() }
    );
  }

  const db = await getDb();
  const quizzes = db.collection("engagement_quizzes");

  // Clear previous demo docs for this gamePk
  await quizzes.deleteMany({ gamePk });

  // Insert all as "queued" with deterministic order index
  // We'll set createdAt/revealAt/expiresAt only when we activate them in /latest
  const docs = DEMO_QUESTIONS.map((q, idx) => {
    const _id = new ObjectId();
    return {
      _id,
      quizId: _id.toHexString(),
      gamePk,
      idx,                     // display order
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      status: "queued",        // "queued" | "active" | "done"
      // timestamps filled when activated
      createdAt: null,
      revealAt: null,
      expiresAt: null,
    };
  });

  await quizzes.insertMany(docs);

  return NextResponse.json(
    {
      success: true,
      seeded: docs.length,
      message: "Demo questions seeded.",
      quizIds: docs.map(d => d.quizId),
    },
    { headers: cors() }
  );
}
