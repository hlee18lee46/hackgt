export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

type Ctx = { params: Promise<{ gamePk: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { gamePk } = await ctx.params;
  const pk = Number(gamePk);
  if (!pk) return NextResponse.json({ success:false, error:"bad gamePk" }, { status:400, headers: CORS });

  const db = await getDb();
  const votes = db.collection("quiz_votes");

  const agg = await votes.aggregate([
    { $match: { gamePk: pk } },
    { $group: { _id: "$userKey", votes: { $sum: 1 } } },
    { $sort: { votes: -1 } },
    { $limit: 20 },
  ]).toArray();

  return NextResponse.json({ success:true, leaders: agg }, { headers: CORS });
}
