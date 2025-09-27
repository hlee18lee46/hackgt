import type { NextRequest } from "next/server";
import { getDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayISO();

  const db = await getDb();
  const col = db.collection("games");

  const docs = await col
    .find({ date })
    .project({ _id: 0 })           // hide _id for cleaner output
    .sort({ gameDate: 1 })
    .toArray();

  return Response.json({ ok: true, date, count: docs.length, games: docs });
}
