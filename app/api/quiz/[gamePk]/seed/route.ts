// app/api/quiz/[gamePk]/seed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPlayerSeasonStats } from "@/lib/mlb";

// Basic CORS helper
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

type Choice = { label: string };
interface QuizQuestionDoc {
  _id: ObjectId;
  gamePk: number;
  text: string;
  choices: Choice[];
  correctIndex?: number | null;
  // reveal = when to show correct answer
  revealAt: Date;
  // closes = when to stop accepting votes (for your 2-minute leaderboard tick)
  closesAt: Date;
  createdAt: Date;
  // optional metadata you can use client-side
  meta?: Record<string, any>;
}

// Small helpers
const now = () => new Date();
const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

// Build a stats-based question from the current game doc
async function buildQuestionFromGame(game: any): Promise<QuizQuestionDoc | null> {
  // we prefer batter/pitcher questions; fall back to definitions if data is missing
  const batter = game?.batter; // { id, name }
  const pitcher = game?.pitcher; // { id, name }

  // pick a season to ask about (default: current year)
  const season = new Date().getFullYear();

  // Utility to make MC options around a numeric stat (with one correct)
  function mkNumericChoices(correctValue: number | string): { choices: Choice[]; correctIndex: number } {
    const num = typeof correctValue === "string" ? Number(correctValue.replace(/[^\d.]/g, "")) : Number(correctValue);
    const deltas = [-2, -1, 0, 1].sort(() => Math.random() - 0.5);
    const opts = deltas.map((d) => {
      // if value is fractional like avg .311, keep 3 decimals
      if (!Number.isFinite(num)) return String(correctValue);
      const isRate = num > 0 && num < 2 && String(correctValue).includes(".");
      const val = isRate ? (num + d * 0.01) : (num + d);
      return isRate ? val.toFixed(3) : String(Math.max(0, Math.round(val)));
    });
    const correctIdx = opts.indexOf(
      typeof correctValue === "number" ? String(correctValue) : String(correctValue)
    );
    // If not found (because of rounding), force-place correct
    if (correctIdx === -1) {
      const idx = Math.floor(Math.random() * opts.length);
      opts[idx] = String(correctValue);
      return { choices: opts.map((label) => ({ label })), correctIndex: idx };
    }
    return { choices: opts.map((label) => ({ label })), correctIndex: correctIdx };
  }

  // Try batter/home-run career high style (use season max we have – single season example)
  if (batter?.id) {
    // Example Q: "What was <batter>'s stolen bases in 2023?"
    // or "What was <batter>'s home runs in 2021?"
    // We'll pick one of your allowed prompts at random.
    const variants = [
      { key: "homeRuns", season: season - 4, label: "home runs" },          // e.g., 2021
      { key: "stolenBases", season: season - 2, label: "stolen bases" },     // e.g., 2023
      { key: "strikeOuts", season: season - 1, label: "strikeouts" },        // last season
    ].sort(() => Math.random() - 0.5);

    for (const v of variants) {
      try {
        const stat = await getPlayerSeasonStats(Number(batter.id), v.season);
        if (stat && stat[v.key] != null) {
          const correct = stat[v.key];
          const { choices, correctIndex } = mkNumericChoices(correct);
          const q: QuizQuestionDoc = {
            _id: new ObjectId(),
            gamePk: Number(game.gamePk),
            text: `What were ${batter.name}'s ${v.label} in ${v.season}?`,
            choices,
            correctIndex,
            revealAt: addSeconds(now(), 5),      // show correct after 5s
            closesAt: addSeconds(now(), 120),    // close tally after 2min
            createdAt: now(),
            meta: { playerId: Number(batter.id), season: v.season, key: v.key },
          };
          return q;
        }
      } catch {
        // ignore and try next variant
      }
    }
  }

  // Try pitcher ERA this season
  if (pitcher?.id) {
    try {
      const stat = await getPlayerSeasonStats(Number(pitcher.id), season);
      const era = stat?.era ?? stat?.ERA ?? null;
      if (era != null) {
        const { choices, correctIndex } = mkNumericChoices(era);
        const q: QuizQuestionDoc = {
          _id: new ObjectId(),
          gamePk: Number(game.gamePk),
          text: `What is ${pitcher.name}'s ERA in ${season}?`,
          choices,
          correctIndex,
          revealAt: addSeconds(now(), 5),
          closesAt: addSeconds(now(), 120),
          createdAt: now(),
          meta: { playerId: Number(pitcher.id), season, key: "era" },
        };
        return q;
      }
    } catch {
      // fall through to glossary
    }
  }

  // Glossary fallback (no correctIndex; it’s educational). You can supply a default correct option if you prefer.
  const glossary = [
    {
      text: "What is WHIP?",
      choices: [
        { label: "Walks + Hits per Inning Pitched" },
        { label: "Wins per Inning Pitched" },
        { label: "Wild pitches per Inning" },
        { label: "Walks per 9 innings" },
      ],
      correctIndex: 0,
    },
    {
      text: "What is ERA?",
      choices: [
        { label: "Earned Runs Allowed per 9 innings" },
        { label: "Extra Runs Average" },
        { label: "Errors per Run Allowed" },
        { label: "Earned Runs per Game" },
      ],
      correctIndex: 0,
    },
  ];
  const g = glossary[Math.floor(Math.random() * glossary.length)];
  return {
    _id: new ObjectId(),
    gamePk: Number(game.gamePk),
    text: g.text,
    choices: g.choices,
    correctIndex: g.correctIndex,
    revealAt: addSeconds(now(), 5),
    closesAt: addSeconds(now(), 120),
    createdAt: now(),
    meta: {},
  };
}

export async function POST(
  _req: Request,
  ctx: { params: { gamePk: string } }
) {
  const gamePk = Number(ctx?.params?.gamePk);
  if (!Number.isFinite(gamePk)) {
    return NextResponse.json({ success: false, error: "bad gamePk" }, { status: 400, headers: cors() });
  }

  const db = await getDb();
  const games = db.collection("games");
  const quizQuestions = db.collection<QuizQuestionDoc>("quiz_questions");

  // Get current game snapshot (we rely on your /api/games/[gamePk]/live job to keep this fresh)
  const game = await games.findOne({ gamePk });
  if (!game) {
    return NextResponse.json({ success: false, error: "game not found" }, { status: 404, headers: cors() });
  }

  // Optionally: if there is a still-open question less than ~25s old, reuse it
  const recent = await quizQuestions.findOne(
    { gamePk },
    { sort: { createdAt: -1 } }
  );
  if (recent) {
    const age = Date.now() - new Date(recent.createdAt).getTime();
    if (age < 25_000) {
      return NextResponse.json({ success: true, reused: true, question: recent }, { headers: cors() });
    }
  }

  // Build a new question
  const questionDoc = await buildQuestionFromGame(game);
  if (!questionDoc) {
    return NextResponse.json({ success: false, error: "unable to create question" }, { status: 500, headers: cors() });
  }

  await quizQuestions.insertOne(questionDoc);

  return NextResponse.json({ success: true, question: questionDoc }, { headers: cors() });
}
