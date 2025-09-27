// lib/mlb.ts

// ---------- Types for "schedule" ----------
export interface ScheduleGame {
  gamePk: number;
  gameDate?: string;
  status?: { detailedState?: string };
  teams?: {
    home?: { team?: { name?: string } };
    away?: { team?: { name?: string } };
  };
}

export interface ScheduleResponse {
  dates: Array<{ games: ScheduleGame[] }>;
}

// ---------- Schedule helpers (NEW) ----------
const MLB_BASE = "https://statsapi.mlb.com/api/v1";

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

/** List games for a specific date (YYYY-MM-DD) */
export async function getSchedule(dateISO: string): Promise<ScheduleResponse> {
  const u = new URL(`${MLB_BASE}/schedule`);
  u.searchParams.set("sportId", "1");
  u.searchParams.set("date", dateISO);
  return getJSON<ScheduleResponse>(u.toString());
}

// ---------- Your existing live snapshot code ----------
export type LiveSnapshot = {
  status: string;               // Scheduled | In Progress | Final | etc.
  inning: number | null;
  inning_desc: string;          // e.g., "Top 5th"
  balls: number;
  strikes: number;
  outs: number;
  bases: { "1B": boolean; "2B": boolean; "3B": boolean };
  batter: { id: number; name: string } | null;
  pitcher: { id: number; name: string } | null;
  teams: { home: string; away: string };
  home_RHE: { R: number; H: number; E: number };
  away_RHE: { R: number; H: number; E: number };
  gameDate?: string | null;
  venue?: string | null;
};

export async function fetchMlbLive(gamePk: number): Promise<LiveSnapshot> {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`MLB feed ${res.status}`);

  const j = await res.json();

  const liveData = j?.liveData ?? {};
  const linescore = liveData?.linescore ?? {};
  const currentPlay = liveData?.plays?.currentPlay ?? {};
  const defense = liveData?.plays?.currentPlay?.defense ?? {};
  const offense = liveData?.plays?.currentPlay?.offense ?? {};
  const gData = j?.gameData ?? {};
  const teams = gData?.teams ?? {};
  const status = j?.gameData?.status?.detailedState || j?.gameData?.status?.abstractGameState || "Scheduled";

  // inning / half
  const inning = linescore?.currentInning ?? null;
  const half = linescore?.inningState || (linescore?.isTopInning === true ? "Top" : linescore?.isTopInning === false ? "Bot" : "");
  const inning_desc = inning ? `${half} ${inning}${["th","st","nd","rd"][((inning%10)>3||[11,12,13].includes(inning))?0:(inning%10)] || "th"}` : "—";

  // counts
  const balls = currentPlay?.count?.balls ?? linescore?.balls ?? 0;
  const strikes = currentPlay?.count?.strikes ?? linescore?.strikes ?? 0;
  const outs = linescore?.outs ?? 0;

  // bases (runnersOnBase → runners)
  const runners = liveData?.linescore?.offense ?? {};
  const bases = {
    "1B": Boolean(runners?.first),
    "2B": Boolean(runners?.second),
    "3B": Boolean(runners?.third),
  };

  // batter / pitcher
  const batter = offense?.batter
    ? { id: Number(offense.batter?.id), name: offense.batter?.fullName }
    : (liveData?.boxscore?.offense?.batter ? { id: Number(liveData.boxscore.offense.batter?.id), name: liveData.boxscore.offense.batter?.fullName } : null);

  const pitcher = defense?.pitcher
    ? { id: Number(defense.pitcher?.id), name: defense.pitcher?.fullName }
    : (liveData?.boxscore?.defense?.pitcher ? { id: Number(liveData.boxscore.defense.pitcher?.id), name: liveData.boxscore.defense.pitcher?.fullName } : null);

  // teams + score
  const homeName = teams?.home?.name || j?.gameData?.teams?.home?.name || "Home";
  const awayName = teams?.away?.name || j?.gameData?.teams?.away?.name || "Away";
  const homeRuns = Number(linescore?.teams?.home?.runs ?? j?.liveData?.boxscore?.teams?.home?.teamStats?.batting?.runs ?? 0);
  const awayRuns = Number(linescore?.teams?.away?.runs ?? j?.liveData?.boxscore?.teams?.away?.teamStats?.batting?.runs ?? 0);
  const homeHits = Number(linescore?.teams?.home?.hits ?? 0);
  const awayHits = Number(linescore?.teams?.away?.hits ?? 0);
  const homeErr = Number(linescore?.teams?.home?.errors ?? 0);
  const awayErr = Number(linescore?.teams?.away?.errors ?? 0);

  const venue = j?.gameData?.venue?.name ?? null;
  const gameDate = j?.gameData?.datetime?.dateTime ?? null;

  return {
    status,
    inning: inning ?? null,
    inning_desc,
    balls, strikes, outs,
    bases,
    batter,
    pitcher,
    teams: { home: homeName, away: awayName },
    home_RHE: { R: homeRuns, H: homeHits, E: homeErr },
    away_RHE: { R: awayRuns, H: awayHits, E: awayErr },
    gameDate,
    venue,
  };
}
