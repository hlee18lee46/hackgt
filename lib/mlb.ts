export const MLB_BASE = "https://statsapi.mlb.com/api/v1";

export interface LinescoreTeamSide {
  team?: { name?: string };
  runs?: number;
  hits?: number;
  errors?: number;
}

export interface Linescore {
  currentInning?: number | null;
  currentInningOrdinal?: string | null;
  inningState?: string | null;
  outs?: number | null;
  balls?: number | null;
  strikes?: number | null;
  teams?: { home?: LinescoreTeamSide; away?: LinescoreTeamSide };
  offense?: { first?: unknown; second?: unknown; third?: unknown };
}

export interface ScheduleGame {
  gamePk: number;
  gameDate?: string;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function getSchedule(dateISO: string) {
  const url = new URL(`${MLB_BASE}/schedule`);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("date", dateISO);
  return getJSON<{ dates: Array<{ games: ScheduleGame[] }> }>(url.toString());
}

export async function getLinescore(gamePk: number) {
  return getJSON<Linescore>(`${MLB_BASE}/game/${gamePk}/linescore`);
}

export async function getBoxscore(gamePk: number) {
  return getJSON<{
    teams?: {
      home?: { team?: { name?: string } };
      away?: { team?: { name?: string } };
    };
  }>(`${MLB_BASE}/game/${gamePk}/boxscore`);
}
