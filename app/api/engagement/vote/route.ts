export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
export async function OPTIONS() { return new Response(null, { headers: cors() }); }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { quizId, gamePk, option, userName } = body || {};
    if (!quizId || !gamePk || !option || !userName) {
      return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400, headers: cors() });
    }

    const db = await getDb();
    // idempotency: one vote per user per quiz
    await db.collection("quiz_votes").updateOne(
      { quizId, userName },
      { $set: { quizId, gamePk: Number(gamePk), option: String(option), userName: String(userName), ts: new Date() } },
      { upsert: true }
    );

    return NextResponse.json({ success: true }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "Server error" }, { status: 500, headers: cors() });
  }
}
