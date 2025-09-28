// app/api/engagement/quiz/[gamePk]/latest/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { fetchMlbLive, getPlayerSeasonStats } from "@/lib/mlb";

// --- helpers ---
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

function int(n: any, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickChoices(correctLabel: string, wrongLabels: string[]) {
  const opts = shuffle([correctLabel, ...wrongLabels]);
  const correctIndex = opts.indexOf(correctLabel);
  return { options: opts, correctIndex };
}

const REVEAL_MS = 5_000;   // show correct after 5s (client also counts down)
const EXPIRES_MS = 120_000; // 2 min lifetime (leaderboard cadence)

// --- core: ensure we have live context (batter/pitcher) ---
async function ensureLiveContext(gamePk: number) {
  const db = await getDb();
  const col = db.collection("games");
  let doc = await col.findOne({ gamePk });

  const now = Date.now();
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt).getTime() : 0;

  if (!doc?.batter?.id || !doc?.pitcher?.id || now - updatedAt > 10_000) {
    // Pull fresh from MLB
    try {
      const snap = await fetchMlbLive(gamePk);
      const payload = {
        gamePk,
        date: doc?.date ?? (snap.gameDate ? new Date(snap.gameDate).toISOString().slice(0,10) : null),
        gameDate: snap.gameDate ?? doc?.gameDate ?? null,
        status: snap.status,
        inning: snap.inning,
        inning_desc: snap.inning_desc,
        balls: snap.balls,
        strikes: snap.strikes,
        outs: snap.outs,
        bases: snap.bases,
        batter: snap.batter,
        pitcher: snap.pitcher,
        teams: snap.teams,
        home_RHE: snap.home_RHE,
        away_RHE: snap.away_RHE,
        venue: snap.venue ?? doc?.venue ?? null,
        updatedAt: new Date(),
      };
      await col.updateOne(
        { gamePk },
        { $set: payload, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      doc = await col.findOne({ gamePk });
    } catch {
      // swallow: we'll fall back to definition questions
    }
  }
  return doc;
}

// --- question generators (return null if not possible) ---
type Built = {
  text: string;
  options: string[];
  correctIndex: number;
  meta: Record<string, any>;
};

async function qPitcherEra(gamePk: number): Promise<Built | null> {
  const live = await ensureLiveContext(gamePk);
  const pid = int(live?.pitcher?.id);
  if (!pid) return null;

  // Current year by NY time
  const year = new Date().toLocaleString("en-US", { timeZone: "America/New_York", year: "numeric" });
  const season = int(year) || new Date().getFullYear();

  const stat = await getPlayerSeasonStats(pid, season);
  const era = stat?.era ? String(stat.era) : null;
  if (!era) return null;

  const wrongs = ["2.10", "3.50", "4.80", "1.95"].filter(v => v !== era).slice(0, 3);
  const { options, correctIndex } = pickChoices(era, wrongs);

  return {
    text: `Pitcher's ERA in ${season}?`,
    options,
    correctIndex,
    meta: { type: "pitcher_era", playerId: pid, season },
  };
}

async function qBatterSeasonValue(
  gamePk: number,
  season: number,
  key: string,
  label: string
): Promise<Built | null> {
  const live = await ensureLiveContext(gamePk);
  const bid = int(live?.batter?.id);
  if (!bid) return null;

  const stat = await getPlayerSeasonStats(bid, season);
  const raw = stat?.[key];
  if (raw == null) return null;

  // Normalize numeric-ish fields that MLB returns as string decimals
  const answer = typeof raw === "number" ? String(raw) : String(raw);

  // quick heuristic wrongs (distinct)
  const pool = new Set<string>();
  pool.add(answer);
  const wrongs: string[] = [];
  const asNum = Number(answer);
  const numeric = Number.isFinite(asNum);

  while (wrongs.length < 3) {
    let cand: string;
    if (numeric) {
      const jitter = (Math.random() * 0.25 + 0.1) * (asNum || 1);
      const sign = Math.random() > 0.5 ? 1 : -1;
      const n = Math.max(0, Math.round((asNum + sign * jitter) * 100) / 100);
      cand = String(n);
    } else {
      cand = String(Math.floor(Math.random() * 25) + 1);
    }
    if (!pool.has(cand)) {
      pool.add(cand);
      wrongs.push(cand);
    }
  }

  const { options, correctIndex } = pickChoices(answer, wrongs);

  return {
    text: `Current batter’s ${label} in ${season}?`,
    options,
    correctIndex,
    meta: { type: `batter_${key}_${season}`, playerId: bid, season },
  };
}

function qDefineWhip(): Built {
  const correct = "Walks + Hits per Inning Pitched";
  const wrong = [
    "Wins per Inning Pitched",
    "Wild pitches per Inning",
    "Walks per 9 innings",
  ];
  const { options, correctIndex } = pickChoices(correct, wrong);
  return {
    text: "What is WHIP?",
    options,
    correctIndex,
    meta: { type: "define_whip" },
  };
}

function qDefineEra(): Built {
  const correct = "Earned Run Average";
  const wrong = ["Extra Runs Allowed", "Estimated Run Average", "Eventual Runs Against"];
  const { options, correctIndex } = pickChoices(correct, wrong);
  return {
    text: "What does ERA stand for?",
    options,
    correctIndex,
    meta: { type: "define_era" },
  };
}

// --- choose next quiz, avoiding repeating same type ---
async function buildNextQuiz(gamePk: number): Promise<Built> {
  const now = Date.now();

  // Try dynamic questions first
  const plan: Array<() => Promise<Built | null>> = [
    () => qPitcherEra(gamePk),
    () => qBatterSeasonValue(gamePk, new Date().getFullYear(), "stolenBases", "stolen bases"),
    () => qBatterSeasonValue(gamePk, 2023, "stolenBases", "stolen bases"),
    () => qBatterSeasonValue(gamePk, 2021, "homeRuns", "home runs"),
    () => qBatterSeasonValue(gamePk, new Date().getFullYear() - 1, "strikeOuts", "strikeouts"),
  ];

  // Fallbacks at the end
  const fallbacks: Built[] = [qDefineWhip(), qDefineEra()];

  for (const make of plan) {
    try {
      const b = await make();
      if (b) return b;
    } catch {}
  }
  // If nothing dynamic is possible, rotate definition questions
  return fallbacks[now % fallbacks.length];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gamePk: string }> }
) {
  const p = await params;
  const gamePk = Number(p.gamePk);
  if (!gamePk) {
    return NextResponse.json({ success: false, error: "bad gamePk" }, { status: 400, headers: CORS });
  }

  const db = await getDb();
  const quizzes = db.collection("eng_quizzes");

  // If there’s a non-expired quiz already, return it
  const now = new Date();
  const existing = await quizzes.findOne({
    gamePk,
    expiresAt: { $gt: now.toISOString() },
  });
  if (existing) {
    return NextResponse.json(
      {
        success: true,
        quiz: {
          quizId: String(existing._id),
          gamePk,
          question: existing.text,
          options: existing.choices.map((c: any) => c.label),
          createdAt: existing.createdAt,
          expiresAt: existing.expiresAt,
          // correctIndex intentionally omitted until clients reveal, but it’s stored on doc
        },
      },
      { headers: CORS }
    );
  }

  // Build a new quiz
  const built = await buildNextQuiz(gamePk);

  const createdAt = new Date();
  const revealAt = new Date(createdAt.getTime() + REVEAL_MS);
  const expiresAt = new Date(createdAt.getTime() + EXPIRES_MS);

  const doc = {
    gamePk,
    text: built.text,
    choices: built.options.map((label) => ({ label })),
    correctIndex: built.correctIndex,
    createdAt: createdAt.toISOString(),
    revealAt: revealAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    meta: built.meta ?? {},
  };

  const ins = await quizzes.insertOne(doc);
  return NextResponse.json(
    {
      success: true,
      quiz: {
        quizId: String(ins.insertedId),
        gamePk,
        question: doc.text,
        options: built.options,
        createdAt: doc.createdAt,
        expiresAt: doc.expiresAt,
      },
    },
    { headers: CORS }
  );
}
