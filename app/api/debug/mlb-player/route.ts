// app/api/debug/mlb-player/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

async function fetchJSON(url: string) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "livesports/1.0 (+local-debug)",
      Accept: "application/json",
    },
  });
  const text = await r.text();
  // Try to parse; include raw text if parsing fails to help debugging
  try {
    const json = JSON.parse(text);
    return { ok: r.ok, status: r.status, json, text: null as string | null };
  } catch {
    return { ok: r.ok, status: r.status, json: null as any, text };
  }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const playerId = u.searchParams.get("playerId");
  const season = u.searchParams.get("season") ?? "2025";
  const group = u.searchParams.get("group") ?? "";
  const gameType = u.searchParams.get("gameType") ?? "";

  if (!playerId) {
    return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400, headers: CORS });
  }

  const params = new URLSearchParams({ stats: "season", season, sportId: "1" });
  if (group) params.set("group", group);
  if (gameType) params.set("gameType", gameType);

  const url = `${MLB_BASE}/people/${playerId}/stats?${params.toString()}`;
  const res = await fetchJSON(url);

  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      url,
      // If parse failed, return the raw `text` to see what's up
      payload: res.json ?? null,
      raw: res.text,
    },
    { status: res.ok ? 200 : 502, headers: CORS }
  );
}
