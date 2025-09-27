import type { Linescore, LinescoreTeamSide } from "./mlb";
import { getBoxscore } from "./mlb";

export interface SnapshotRHE {
  R: number;
  H: number;
  E: number;
}

export interface Snapshot {
  gamePk: number;
  date: string; // YYYY-MM-DD
  inning: number | null | undefined;
  inning_desc: string;
  outs: number;
  home_team: string;
  away_team: string;
  home_RHE: SnapshotRHE;
  away_RHE: SnapshotRHE;
  bases: { "1B": boolean; "2B": boolean; "3B": boolean };
  balls: number | null | undefined;
  strikes: number | null | undefined;
  updatedAt: string;
}

function sideToRHE(side?: LinescoreTeamSide): SnapshotRHE {
  return {
    R: Number(side?.runs ?? 0),
    H: Number(side?.hits ?? 0),
    E: Number(side?.errors ?? 0),
  };
}

export async function buildSnapshot(
  gamePk: number,
  ls: Linescore,
  dateISO: string
): Promise<Snapshot> {
  const homeSide = ls.teams?.home;
  const awaySide = ls.teams?.away;

  let home = homeSide?.team?.name;
  let away = awaySide?.team?.name;

  if (!home || !away) {
    const box = await getBoxscore(gamePk);
    home = home ?? box.teams?.home?.team?.name ?? "Home";
    away = away ?? box.teams?.away?.team?.name ?? "Away";
  }

  const inningState = ls.inningState ?? "";
  const inningOrd = ls.currentInningOrdinal ?? "";
  const inningDesc =
    inningState || inningOrd ? `${inningState} ${inningOrd}`.trim() : "—";

  const bases = {
    "1B": Boolean(ls.offense?.first),
    "2B": Boolean(ls.offense?.second),
    "3B": Boolean(ls.offense?.third),
  };

  return {
    gamePk,
    date: dateISO,
    inning: ls.currentInning,
    inning_desc: inningDesc,
    outs: Number(ls.outs ?? 0),
    home_team: home,
    away_team: away,
    home_RHE: sideToRHE(homeSide),
    away_RHE: sideToRHE(awaySide),
    bases,
    balls: ls.balls ?? null,
    strikes: ls.strikes ?? null,
    updatedAt: new Date().toISOString(),
  };
}
