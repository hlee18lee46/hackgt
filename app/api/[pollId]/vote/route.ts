// app/api/polls/[pollId]/vote/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

export async function POST(req: Request, ctx: { params: { pollId: string } }) {
  try {
    const { pollId } = await ctx.params; // Next 15 fix
    const body = await req.json().catch(() => ({}));
    const { userId, choiceIndex } = body as { userId: string; choiceIndex: number };
    if (!pollId || !userId || choiceIndex == null) {
      return NextResponse.json({ success: false, error: "Missing params" }, { status: 400, headers: CORS });
    }
    const db = await getDb();
    const polls = db.collection("polls");
    const pollVotes = db.collection("poll_votes");

    const poll = await polls.findOne({ _id: new ObjectId(pollId) });
    if (!poll) return NextResponse.json({ success: false, error: "Poll not found" }, { status: 404, headers: CORS });

    await pollVotes.updateOne(
      { pollId, userId },
      { $set: { pollId, userId, choiceIndex, ts: new Date() } },
      { upsert: true }
    );

    const tallies = new Array(poll.choices.length).fill(0);
    const cursor = pollVotes.find({ pollId });
    for await (const v of cursor) {
      if (typeof v.choiceIndex === "number" && tallies[v.choiceIndex] != null) {
        tallies[v.choiceIndex] += 1;
      }
    }

    return NextResponse.json({ success: true, tallies }, { headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "error" }, { status: 500, headers: CORS });
  }
}
