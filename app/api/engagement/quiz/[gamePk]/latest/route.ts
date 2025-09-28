export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

/** CORS */
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

// How often we *want* a fresh quiz
const QUIZ_ROTATE_MS = 30_000;
// Per-quiz timing
const REVEAL_IN_MS = 5_000;
const EXPIRES_IN_MS = 120_000;

/**
 * Simple mock-aware guard: treat a game as "live" if status === "In Progress"
 * OR its venue includes "MOCK" (so your seeded mock stays eligible).
 */
async function isGameLiveOrMock(db: any, gamePk: number) {
  const g = await db.collection("games").findOne({ gamePk });
  if (!g) return false;
  const status = String(g.status ?? "");
  const venue = String(g.venue ?? "");
  if (status.toLowerCase() === "in progress".toLowerCase()) return true;
  if (venue.toLowerCase().includes("mock")) return true;
  return false;
}

/** Very small question generator (you can replace with your richer generator) */
function buildFallbackQuestion(gamePk: number) {
  const now = Date.now();
  const createdAt = new Date(now);
  const revealAt = new Date(now + REVEAL_IN_MS);
  const expiresAt = new Date(now + EXPIRES_IN_MS);

  return {
    _id: new ObjectId(),
    quizId: new ObjectId().toHexString(),
    gamePk,
    question: "What does ERA stand for?",
    options: ["Earned Run Average", "Eventual Runs Against", "Extra Runs Allowed", "Estimated Run Average"],
    // omit correctIndex until reveal if you want; or include it now if you prefer
    createdAt,
    revealAt,
    expiresAt,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ gamePk: string }> }) {
  const { gamePk: raw } = await ctx.params;
  const url = new URL(req.url);
  const includeExpired = url.searchParams.get("includeExpired") === "1";

  const gamePk = Number(raw);
  if (!gamePk) {
    return NextResponse.json({ success: false, message: "Bad gamePk" }, { status: 400, headers: cors() });
  }

  const db = await getDb();
  const col = db.collection("engagement_quizzes"); // <- use your collection name

  // 1) Pull most recent quiz for this game
  const last = await col.findOne({ gamePk }, { sort: { createdAt: -1 } });

  // 2) If caller wants expired quizzes too and we have one, return it as-is
  if (includeExpired && last) {
    // Ensure quizId exists
    const quizId = (last.quizId as string) ?? (last._id as ObjectId).toHexString();

    return NextResponse.json({
      success: true,
      quiz: {
        quizId,
        gamePk: last.gamePk,
        question: last.question,
        options: last.options ?? [],
        createdAt: last.createdAt ? new Date(last.createdAt).toISOString() : undefined,
        revealAt: last.revealAt ? new Date(last.revealAt).toISOString() : undefined,
        expiresAt: last.expiresAt ? new Date(last.expiresAt).toISOString() : undefined,
        // do NOT include correctIndex unless you want it revealed immediately
      },
    }, { headers: cors() });
  }

  // 3) If we already have a relatively fresh quiz (< QUIZ_ROTATE_MS old), return it (even if reveal is in future)
  const now = Date.now();
  const freshEnough = last && last.createdAt && now - new Date(last.createdAt).getTime() < QUIZ_ROTATE_MS;
  if (freshEnough) {
    const quizId = (last.quizId as string) ?? (last._id as ObjectId).toHexString();
    return NextResponse.json({
      success: true,
      quiz: {
        quizId,
        gamePk: last.gamePk,
        question: last.question,
        options: last.options ?? [],
        createdAt: last.createdAt ? new Date(last.createdAt).toISOString() : undefined,
        revealAt: last.revealAt ? new Date(last.revealAt).toISOString() : undefined,
        expiresAt: last.expiresAt ? new Date(last.expiresAt).toISOString() : undefined,
      },
    }, { headers: cors() });
  }

  // 4) Otherwise, if game is live (or mock), auto-generate a new quiz
  const canAutoGen = await isGameLiveOrMock(db, gamePk);
  if (canAutoGen) {
    const q = buildFallbackQuestion(gamePk);

    // persist (always store a quizId field for clients)
    const doc = {
      _id: q._id,
      quizId: q.quizId,
      gamePk,
      question: q.question,
      options: q.options,
      createdAt: q.createdAt,
      revealAt: q.revealAt,
      expiresAt: q.expiresAt,
      // Optionally store correctIndex server-side if you need grading later,
      // but omit it from the GET until reveal moment.
      // correctIndex: 0,
    };

    await col.insertOne(doc);

    return NextResponse.json({
      success: true,
      quiz: {
        quizId: q.quizId,
        gamePk,
        question: q.question,
        options: q.options,
        createdAt: q.createdAt.toISOString(),
        revealAt: q.revealAt.toISOString(),
        expiresAt: q.expiresAt.toISOString(),
      },
    }, { headers: cors() });
  }

  // 5) No quiz and can’t auto-generate → return null
  return NextResponse.json({ success: true, quiz: null }, { headers: cors() });
}
