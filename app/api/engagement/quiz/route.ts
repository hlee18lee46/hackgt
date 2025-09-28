// app/api/engagement/quiz/route.ts
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
export async function OPTIONS() {
  return new Response(null, { headers: cors() });
}

// Eastern-season helper (YYYY)
function seasonNY(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    dateStyle: "short",
  })
    .format(now)
    .split("/");
  // Fallback to UTC year if format is unexpected
  const y = parts?.[0]?.length === 4 ? Number(parts[0]) : now.getUTCFullYear();
  return y;
}

function pick<T>(arr: T[]): T | undefined {
  if (!arr?.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

type QuizPayload = {
  quizId: string;            // our string id (not Mongo _id)
  gamePk: number;
  question: string;
  options: string[];
  correctIndex: number;
  detail?: string;           // extra context line (optional)
  ttlSec: number;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gamePk = Number(url.searchParams.get("gamePk"));
    if (!Number.isFinite(gamePk)) {
      return NextResponse.json(
        { success: false, message: "Missing or bad gamePk" },
        { status: 400, headers: cors() }
      );
    }

    const db = await getDb();

    // Pull latest game snapshot for batter/pitcher names & ids
    const game = await db.collection("games").findOne(
      { gamePk },
      {
        projection: {
          gamePk: 1,
          batter: 1,
          pitcher: 1,
          teams: 1,
          updatedAt: 1,
        },
      }
    );

    // If no live doc, still return a generic quiz
    const season = seasonNY();

    // Build a pool of question generators. We’ll try batter first, then pitcher, then a generic fallback.
    const qGens: Array<() => Promise<QuizPayload | null>> = [];

    // ——— Batter-based question
    if (game?.batter?.id && game?.batter?.name) {
      qGens.push(async () => {
        const playerId = Number(game.batter.id);
        const name = String(game.batter.name);
        const statDoc = await db.collection("mlb_player_stats").findOne(
          { playerId, season },
          { projection: { stat: 1 } }
        );

        // If we have no cached stats, return null so another generator can try
        const stat = statDoc?.stat ?? null;
        if (!stat) return null;

        // choose one numeric stat to ask about
        const candidates: Array<{ key: string; label: string }> = [
          { key: "homeRuns", label: "home runs" },
          { key: "rbi", label: "RBIs" },
          { key: "stolenBases", label: "stolen bases" },
          { key: "runs", label: "runs" },
          { key: "hits", label: "hits" },
        ].filter((c) => typeof stat[c.key] === "number");

        const chosen = pick(candidates);
        if (!chosen) return null;

        const trueVal: number = Number(stat[chosen.key]);
        // Build plausible distractors
        const deltas = [-3, -1, +2, +5, +7, -5].map((d) => Math.max(0, trueVal + d));
        const pool = Array.from(new Set([trueVal, ...deltas]));
        // Pick 4 unique options, ensuring the true value is included
        const options = Array.from(new Set([trueVal, ...pick(pool.slice(0, 4)) ? [pick(pool.slice(0, 4))] : []]))
          .concat(pool)
          .slice(0, 4);

        // If uniqueness failed somehow, enforce it
        const unique = Array.from(new Set(options)).slice(0, 4);
        if (!unique.includes(trueVal)) {
          unique[unique.length - 1] = trueVal;
        }

        // Shuffle
        for (let i = unique.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [unique[i], unique[j]] = [unique[j], unique[i]];
        }
        const correctIndex = unique.findIndex((v) => v === trueVal);

        const quizId = `${gamePk}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const payload: QuizPayload = {
          quizId,
          gamePk,
          question: `How many ${chosen.label} does ${name} have in ${season}?`,
          options: unique.map((n) => String(n)),
          correctIndex: Math.max(0, correctIndex),
          detail: `Source: MLB season stats ${season}`,
          ttlSec: 90,
        };

        // Store the quiz (let Mongo assign _id)
        await db.collection("quiz_questions").insertOne({
          ...payload,
          createdAt: new Date(),
        });

        return payload;
      });
    }

    // ——— Pitcher-based question
    if (game?.pitcher?.id && game?.pitcher?.name) {
      qGens.push(async () => {
        const playerId = Number(game.pitcher.id);
        const name = String(game.pitcher.name);
        const statDoc = await db.collection("mlb_player_stats").findOne(
          { playerId, season },
          { projection: { stat: 1 } }
        );
        const stat = statDoc?.stat ?? null;
        if (!stat) return null;

        // Prefer strikeOuts; fallback to wins or saves if present
        const fieldOrder: Array<{ key: string; label: string }> = [
          { key: "strikeOuts", label: "strikeouts" },
          { key: "wins", label: "wins" },
          { key: "saves", label: "saves" },
        ];
        const chosen = fieldOrder.find((f) => typeof stat[f.key] === "number");
        if (!chosen) return null;

        const trueVal: number = Number(stat[chosen.key]);
        const deltas = [-4, -2, +1, +3, +6, -1].map((d) => Math.max(0, trueVal + d));
        const pool = Array.from(new Set([trueVal, ...deltas]));
        const unique = pool.slice(0, 4);
        if (!unique.includes(trueVal)) unique[unique.length - 1] = trueVal;
        // Shuffle
        for (let i = unique.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [unique[i], unique[j]] = [unique[j], unique[i]];
        }
        const correctIndex = unique.findIndex((v) => v === trueVal);

        const quizId = `${gamePk}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const payload: QuizPayload = {
          quizId,
          gamePk,
          question: `How many ${chosen.label} does ${name} have in ${season}?`,
          options: unique.map((n) => String(n)),
          correctIndex: Math.max(0, correctIndex),
          detail: `Source: MLB season stats ${season}`,
          ttlSec: 90,
        };

        await db.collection("quiz_questions").insertOne({
          ...payload,
          createdAt: new Date(),
        });

        return payload;
      });
    }

    // ——— Fallback: simple team-trivia style question
    qGens.push(async () => {
      const teams = game?.teams
        ? [String(game.teams.away ?? "Away"), String(game.teams.home ?? "Home")]
        : ["Away", "Home"];
      const correctIndex = Math.round(Math.random()); // 0 or 1
      const question = "Which team will score next?";
      const quizId = `${gamePk}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload: QuizPayload = {
        quizId,
        gamePk,
        question,
        options: teams,
        correctIndex, // unknown yet—this is for engagement, not grading
        ttlSec: 90,
      };
      await db.collection("quiz_questions").insertOne({
        ...payload,
        createdAt: new Date(),
      });
      return payload;
    });

    // Try generators in order until one returns a quiz
    let quiz: QuizPayload | null = null;
    for (const make of qGens) {
      // eslint-disable-next-line no-await-in-loop
      const out = await make();
      if (out) {
        quiz = out;
        break;
      }
    }

    if (!quiz) {
      // Shouldn’t happen, but be safe
      return NextResponse.json(
        { success: false, message: "Could not craft a quiz" },
        { status: 500, headers: cors() }
      );
    }

    return NextResponse.json({ success: true, quiz }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message ?? "Server error" },
      { status: 500, headers: cors() }
    );
  }
}
