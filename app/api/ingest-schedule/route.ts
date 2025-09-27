import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/mongodb";
import { getSchedule } from "../../../lib/mlb";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

function todayISOinNY(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    dateStyle: "short",
  }).format(now).split("/");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayISOinNY();

  try {
    const sched = await getSchedule(date);
    const games = sched.dates.flatMap((d) => d.games);

    const db = await getDb();
    const col = db.collection("games");

    let processed = 0;
    let upserts = 0;
    const errors: Array<{ gamePk: number; error: string }> = [];

    for (const g of games) {
      const gamePk = Number(g.gamePk);
      if (!Number.isFinite(gamePk)) continue;
      processed++;

      const homeName = g.teams?.home?.team?.name ?? "Home";
      const awayName = g.teams?.away?.team?.name ?? "Away";

      const doc = {
        gamePk,
        date,                                   // schedule date (YYYY-MM-DD)
        gameDate: g.gameDate ?? null,           // UTC ISO time
        status: g.status?.detailedState ?? null,
        teams: {
          home: homeName,
          away: awayName,
        },
        // Linescore snapshot fields (optional placeholders; will be filled by another job if you want)
        inning: null,
        inning_desc: "—",
        outs: 0,
        home_RHE: { R: 0, H: 0, E: 0 },
        away_RHE: { R: 0, H: 0, E: 0 },
        bases: { "1B": false, "2B": false, "3B": false },
        balls: null,
        strikes: null,

        updatedAt: new Date(),
      };

      try {
        const res = await col.updateOne(
          { gamePk },
          { $set: doc, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
        if (res.upsertedCount > 0 || res.modifiedCount > 0) upserts++;
      } catch (e) {
        errors.push({ gamePk, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return Response.json({ ok: true, date, total: games.length, processed, upserts, errors });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500 }
    );
  }
}
