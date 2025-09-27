// app/api/games/[gamePk]/live/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

export async function GET(_req: Request, { params }: { params: { gamePk: string } }) {
  return NextResponse.json(
    { ok: true, params },
    { headers: cors() }
  );
}
