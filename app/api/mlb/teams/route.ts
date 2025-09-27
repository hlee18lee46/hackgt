export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTeams } from "@/lib/mlb";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

export async function GET() {
  try {
    const teams = await getTeams();
    return NextResponse.json({ success: true, teams }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "failed to load teams" },
      { status: 500, headers: cors() }
    );
  }
}
