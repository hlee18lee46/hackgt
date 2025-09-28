// app/api/engagement/quiz/[gamePk]/seed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

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

// Helpers
const nyNow = () =>
  new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeNumericChoices(correct: number, spread = 5) {
  const set = new Set<number>([correct]);
  // generate nearby distractors
  for (let i = 0; i < 20 && set.size < 4; i++) {
    const delta = Math.max(1, Math.floor(Math.random() * spread) + 1);
    const sign = Math.random() < 0.5 ? -1 : 1;
    const cand = Math.max(0, correct + sign * delta);
    set.add(cand);
  }
  // shuffle
  const out = Array.from(set);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, 4);
}

/**
 * Try to build player-based questions from cached DB:
 * - Batter career-high HR
 * - Pitcher ERA this season
 * If not available, returns [] and caller can fallback.
 */
async function buildPlayerQuestions(db: any, gamePk: number) {
  const questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    meta?: Record<string, any>;
  }> = [];

  const games = db.collection("games");
  const playerStats = db.collection("mlb_player_stats");

  // read latest game doc to know batter/pitcher ids
  const g = await games.findOne({ gamePk });
  const batter = g?.batter ?? null;
  const pitcher = g?.pitcher ?? null;

  // 1) Batter career-high HR across seasons
  if (batter?.id) {
    const cursor = playerStats
      .find({ playerId: Number(batter.id) })
      .project({ season: 1, "stat.homeRuns": 1 })
      .sort({ season: 1 });

    const seasons = await cursor.toArray();
    const hrValues = seasons
      .map((s: any) => Number(s?.stat?.homeRuns ?? 0))
      .filter((x: any) => Number.isFinite(x));
    if (hrValues.length) {
      const careerHigh = Math.max(...hrValues);
      const choices = makeNumericChoices(careerHigh, 7);
      const correctIndex = choices.findIndex((n) => n === careerHigh);
      questions.push({
        question: `What is ${batter.name}'s career-high home runs in a single MLB season?`,
        options: choices.map((n) => String(n)),
        correctIndex,
        meta: { type: "batter_career_hr", playerId: batter.id },
      });
    }
  }

  // 2) Pitcher ERA this season (NY year)
  if (pitcher?.id) {
    const season = nyNow().getFullYear();
    const ps = await playerStats.findOne(
      { playerId: Number(pitcher.id), season },
      { projection: { "stat.era": 1 } }
    );
    const eraStr = ps?.stat?.era;
    const era = eraStr ? Number(eraStr) : NaN;

    if (Number.isFinite(era)) {
      // build choices around ERA with two decimals
      const base = Math.round(era * 100);
      const variants = new Set<number>([base]);
      for (let i = 0; i < 40 && variants.size < 4; i++) {
        const delta = (Math.floor(Math.random() * 50) + 10) * (Math.random() < 0.5 ? -1 : 1);
        const v = Math.max(0, base + delta);
        variants.add(v);
      }
      const opts = Array.from(variants).map((x) => (x / 100).toFixed(2));
      // shuffle
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      const correctIndex = opts.findIndex((s) => s === era.toFixed(2));
      questions.push({
        question: `What is ${pitcher.name}'s ERA this season?`,
        options: opts,
        correctIndex,
        meta: { type: "pitcher_era", playerId: pitcher.id, season },
      });
    }
  }

  return questions;
}

export async function POST(
  _req: Request,
  ctx:
    | { params: { gamePk: string } }
    | { params: Promise<{ gamePk: string }> }
) {
  try {
    // handle Next.js “await params” requirement in some environments
    const p: any =
      "then" in (ctx as any).params
        ? await (ctx as any).params
        : (ctx as any).params;

    const gamePk = Number(p.gamePk);
    if (!Number.isFinite(gamePk) || gamePk <= 0) {
      return NextResponse.json(
        { success: false, error: "Bad gamePk" },
        { status: 400, headers: cors() }
      );
    }

    const db = await getDb();
    const quizzes = db.collection("quizzes");

    // Build candidate questions (exclude WHIP by design)
    const candidates = await buildPlayerQuestions(db, gamePk);

    // Always have at least one general fallback (ERA definition)
    const generalFallback = {
      question: "What does ERA stand for?",
      options: [
        "Earned Run Average",
        "Eventual Runs Against",
        "Extra Runs Allowed",
        "Estimated Run Average",
      ],
      correctIndex: 0,
      meta: { type: "term_era_def" },
    };

    const chosen = candidates.length ? pickOne(candidates) : generalFallback;

    const now = nyNow();
    const revealAt = new Date(now.getTime() + 5_000);   // reveal in 5s
    const expiresAt = new Date(now.getTime() + 120_000); // auto-expire in 2m

    const _id = new ObjectId();
    const doc = {
      _id,
      quizId: String(_id), // expose stable id for client
      gamePk,
      question: chosen.question,
      options: chosen.options,
      correctIndex: chosen.correctIndex, // server knows; client may hide until reveal
      createdAt: now,
      revealAt,
      expiresAt,
      meta: chosen.meta ?? {},
    };

    await quizzes.insertOne(doc);

    return NextResponse.json(
      {
        success: true,
        quiz: {
          quizId: doc.quizId,
          gamePk: doc.gamePk,
          question: doc.question,
          options: doc.options,
          createdAt: doc.createdAt,
          revealAt: doc.revealAt,
          expiresAt: doc.expiresAt,
          // do NOT return _id or correctIndex unless you want clients to show answers immediately
        },
      },
      { headers: cors() }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "seed failed" },
      { status: 500, headers: cors() }
    );
  }
}
