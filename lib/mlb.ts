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

// primary: currentPlay.matchup
const matchup = j?.liveData?.plays?.currentPlay?.matchup ?? {};
const mpBatter = matchup?.batter
  ? { id: Number(matchup.batter.id), name: String(matchup.batter.fullName) }
  : null;
const mpPitcher = matchup?.pitcher
  ? { id: Number(matchup.pitcher.id), name: String(matchup.pitcher.fullName) }
  : null;

// fallbacks: boxscore offense/defense
const bsOffense = j?.liveData?.boxscore?.offense ?? {};
const bsDefense = j?.liveData?.boxscore?.defense ?? {};
const odBatter = bsOffense?.batter
  ? { id: Number(bsOffense.batter.id), name: String(bsOffense.batter.fullName) }
  : null;
const odPitcher = bsDefense?.pitcher
  ? { id: Number(bsDefense.pitcher.id), name: String(bsDefense.pitcher.fullName) }
  : null;

// only surface during live play
const isLive = /in\s*progress|live/i.test(status);
const batter = isLive ? (mpBatter ?? odBatter) : null;
const pitcher = isLive ? (mpPitcher ?? odPitcher) : null;

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

// ---------- Teams / Players / Season Stats (NEW) ----------

export type MlbTeam = {
  id: number;
  name: string;
  abbreviation: string;
  location: string;
};

export async function getTeams(): Promise<MlbTeam[]> {
  const url = `${MLB_BASE}/teams?sportId=1`;
  const data = await getJSON<any>(url);
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  return teams.map((t: any) => ({
    id: Number(t.id),
    name: String(t.name),
    abbreviation: String(t.abbreviation),
    location: String(t.locationName),
  }));
}

export type MlbPlayer = {
  id: number;
  fullName: string;
  primaryNumber?: string;
  position?: string;
};

/** Active roster for a team (current season) */
export async function getTeamPlayers(teamId: number): Promise<MlbPlayer[]> {
  const url = `${MLB_BASE}/teams/${teamId}/roster`;
  const data = await getJSON<any>(url);
  const roster = Array.isArray(data?.roster) ? data.roster : [];
  return roster.map((r: any) => ({
    id: Number(r?.person?.id),
    fullName: String(r?.person?.fullName ?? ""),
    primaryNumber: r?.jerseyNumber ? String(r.jerseyNumber) : undefined,
    position: r?.position?.abbreviation ? String(r.position.abbreviation) : undefined,
  }));
}

/** Season aggregate stats for a player (matches your Python `stats=season`) */
export async function getPlayerSeasonStats(playerId: number, season: number): Promise<Record<string, any> | null> {
  const url = `${MLB_BASE}/people/${playerId}/stats?stats=season&season=${season}`;
  const j = await getJSON<any>(url);
  const stat = j?.stats?.[0]?.splits?.[0]?.stat ?? null;
  return stat;
}
