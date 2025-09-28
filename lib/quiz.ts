// lib/quiz.ts
import { getPlayerSeasonStats } from "./mlb"; // you already have this
type Q = {
  question: string;
  choices: string[];   // multiple choice labels
  answerIndex: number; // which index is correct
  meta?: Record<string, any>;
};

/** Round a decimal stat smartly for display */
function smartRound(val: string | number, digits = 3) {
  if (typeof val === "number") return val.toFixed(digits);
  if (typeof val === "string") return val;
  return String(val ?? "—");
}

/** Make numeric distractors around true value */
function surroundChoices(trueVal: number, deltas: number[]): number[] {
  const set = new Set<number>([trueVal]);
  deltas.forEach(d => set.add(trueVal + d));
  return Array.from(set);
}

/** Shuffle utility */
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

/**
 * Build a quiz from player season stats.
 * group: "hitting" | "pitching"
 */
export async function buildPlayerQuiz(playerId: number, season: number, group: "hitting" | "pitching"): Promise<Q | null> {
  const stat = await getPlayerSeasonStats(playerId, season); // Record<string, any> | null
  if (!stat) return null;

  // pick a template that fits available fields
  const templates: Array<() => Q | null> = [
    // Hitting: OPS
    () => {
      if (!stat.ops) return null;
      const trueVal = Number(String(stat.ops).replace(/[^0-9.]/g, ""));
      if (Number.isNaN(trueVal)) return null;
      const pool = surroundChoices(trueVal, [-0.1, -0.05, 0.05, 0.1]).map(v => Number(v.toFixed(3)));
      const choices = shuffle(pool.map(v => v.toFixed(3)));
      const answerIndex = choices.findIndex(c => c === trueVal.toFixed(3));
      return { question: "What is this player’s OPS this season?", choices, answerIndex, meta: { key: "ops", value: trueVal.toFixed(3) } };
    },
    // Hitting: HR
    () => {
      if (stat.homeRuns == null) return null;
      const trueVal = Number(stat.homeRuns);
      const pool = shuffle(surroundChoices(trueVal, [-3, -1, 1, 3]));
      const choices = pool.map(String);
      const answerIndex = choices.findIndex(c => Number(c) === trueVal);
      return { question: "How many home runs does this player have this season?", choices, answerIndex, meta: { key: "homeRuns", value: trueVal } };
    },
    // Hitting: AVG (string like ".274")
    () => {
      if (!stat.avg) return null;
      const num = Number(String(stat.avg).replace(/[^0-9.]/g, ""));
      if (Number.isNaN(num)) return null;
      const trueVal = num;
      const pool = surroundChoices(trueVal, [-0.030, -0.015, 0.015, 0.030]).map(v => Number(v.toFixed(3)));
      const choices = shuffle(pool.map(v => v.toFixed(3)));
      const answerIndex = choices.findIndex(c => c === trueVal.toFixed(3));
      return { question: "What is this player’s batting average this season?", choices, answerIndex, meta: { key: "avg", value: trueVal.toFixed(3) } };
    },
    // Pitching: ERA
    () => {
      if (!stat.era) return null;
      const trueVal = Number(String(stat.era).replace(/[^0-9.]/g, ""));
      if (Number.isNaN(trueVal)) return null;
      const pool = surroundChoices(trueVal, [-1.0, -0.5, 0.5, 1.0]).map(v => Number(v.toFixed(2)));
      const choices = shuffle(pool.map(v => v.toFixed(2)));
      const answerIndex = choices.findIndex(c => c === trueVal.toFixed(2));
      return { question: "What is this pitcher’s ERA this season?", choices, answerIndex, meta: { key: "era", value: trueVal.toFixed(2) } };
    },
  ];

  // prefer group-specific templates first
  const order = group === "pitching" ? [3, 0, 1, 2] : [0, 1, 2, 3];
  for (const idx of order) {
    const q = templates[idx]?.();
    if (q) return q;
  }
  return null;
}
