export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user",
};
export async function OPTIONS() { return new Response(null, { headers: HEADERS }); }

// GET /api/chat/:gamePk?since=ISO&limit=200
export async function GET(req: Request, { params }: { params: { gamePk: string } }) {
  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);
  const gamePk = Number(params.gamePk);
  if (!gamePk) return NextResponse.json({ success:false, message:"Bad gamePk" }, { status:400, headers: HEADERS });

  const db = await getDb();
  const q: any = { gamePk };
  if (since) q.ts = { $gt: new Date(since) };

  const messages = await db.collection("game_chats")
    .find(q).sort({ ts: 1 }).limit(limit).toArray();

  return NextResponse.json({ success:true, messages }, { headers: HEADERS });
}

// POST /api/chat/:gamePk  { name, text }
export async function POST(req: Request, { params }: { params: { gamePk: string } }) {
  const gamePk = Number(params.gamePk);
  if (!gamePk) return NextResponse.json({ success:false, message:"Bad gamePk" }, { status:400, headers: HEADERS });

  const body = await req.json().catch(() => ({}));
  const rawName = (body?.name || req.headers.get("x-user") || "Anon").toString();
  const rawText = (body?.text || "").toString();

  const name = rawName.trim().slice(0, 32);
  const text = rawText.trim().slice(0, 500);

  if (!text) return NextResponse.json({ success:false, message:"Empty text" }, { status:400, headers: HEADERS });

  const db = await getDb();
  await db.collection("game_chats").insertOne({ gamePk, name, text, ts: new Date() });
  // index is created in lib/mongodb.ts: { gamePk: 1, ts: 1 }

  return NextResponse.json({ success:true }, { headers: HEADERS });
}
