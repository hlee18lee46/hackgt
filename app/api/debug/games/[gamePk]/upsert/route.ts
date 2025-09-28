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

export async function POST(req: Request, { params }: { params: { gamePk: string } }) {
  const gamePk = Number(params.gamePk);
  if (!gamePk) return NextResponse.json({ success:false, error:"bad gamePk" }, { status:400, headers: cors() });

  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const col = db.collection("games");

  const payload = {
    ...body,
    gamePk,
    updatedAt: new Date(),
  };
  delete (payload as any)._id;

  await col.updateOne(
    { gamePk },
    { $set: payload, $setOnInsert: { createdAt: payload.createdAt ?? new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ success:true, gamePk }, { headers: cors() });
}
