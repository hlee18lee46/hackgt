// app/api/polls/route.ts  (GET ?gamePk=xxxx)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gamePk = Number(url.searchParams.get("gamePk"));
  if (!gamePk) return NextResponse.json({ success: false, error: "Missing gamePk" }, { status: 400, headers: CORS });

  const db = await getDb();
  const polls = db.collection("polls");
  const list = await polls.find({ gamePk }).sort({ createdAt: -1 }).limit(20).toArray();

  return NextResponse.json({ success: true, polls: list }, { headers: CORS });
}
