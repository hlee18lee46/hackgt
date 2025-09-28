// app/api/quiz/[gamePk]/latest/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

export async function GET() {
  return NextResponse.json(
    { success: false, error: "Legacy quiz API disabled. Use /api/engagement/quiz/[gamePk]/latest" },
    { status: 410, headers: { ...cors(), "Cache-Control": "no-store" } }
  );
}
