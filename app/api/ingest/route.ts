import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/mongodb";
import { getSchedule, getLinescore } from "../../../lib/mlb";
import { buildSnapshot } from "../../../lib/snapshot";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

function todayNY(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", dateStyle: "short" })
    .format(now).split("/");
  if (parts.length === 3 && parts[0].length === 4)
    return `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
  return new Date().toISOString().slice(0,10);
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? todayNY();

  try {
    const sched = await getSchedule(date);
    const games = sched.dates.flatMap(d => d.games);

    const db = await getDb();
    const col = db.collection("games");

    let processed = 0, upserts = 0;
    const errors: Array<{ gamePk:number; error:string }> = [];

    for (const g of games) {
      const gamePk = Number(g.gamePk);
      if (!Number.isFinite(gamePk)) continue;
      processed++;

      try {
        const ls = await getLinescore(gamePk);
        const snap = await buildSnapshot(gamePk, ls, date);

        const res = await col.updateOne(
          { gamePk },
          { $set: snap, $setOnInsert: { createdAt: new Date() } },
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
