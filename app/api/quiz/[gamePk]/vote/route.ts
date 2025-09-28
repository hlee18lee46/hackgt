export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

type Ctx = { params: Promise<{ gamePk: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { gamePk } = await ctx.params;
  const pk = Number(gamePk);
  if (!pk) return NextResponse.json({ success:false, error:"bad gamePk" }, { status:400, headers: CORS });

  const body = await req.json().catch(() => ({}));
  const { qid, answer, userKey = req.headers.get("x-client-id") ?? "anon" } = body || {};
  if (!qid || !answer) {
    return NextResponse.json({ success:false, error:"qid and answer required" }, { status:400, headers: CORS });
  }

  const db = await getDb();
  const votes = db.collection("quiz_votes");
  const quiz = db.collection("quiz_questions");

  const q = await quiz.findOne({ _id: qid, gamePk: pk });
  if (!q) return NextResponse.json({ success:false, error:"quiz not found" }, { status:404, headers: CORS });

  try {
    await votes.updateOne(
      { gamePk: pk, qid, userKey },
      { $set: { gamePk: pk, qid, userKey, answer, ts: new Date() } },
      { upsert: true }
    );
  } catch (e:any) {
    return NextResponse.json({ success:false, error:String(e?.message ?? e) }, { status:500, headers: CORS });
  }

  return NextResponse.json({ success:true }, { headers: CORS });
}
