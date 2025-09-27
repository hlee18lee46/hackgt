export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTeamPlayers } from "@/lib/mlb";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = Number(url.searchParams.get("teamId"));
  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "teamId required" },
      { status: 400, headers: cors() }
    );
  }
  try {
    const players = await getTeamPlayers(teamId);
    return NextResponse.json({ success: true, players }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "failed to load players" },
      { status: 500, headers: cors() }
    );
  }
}
