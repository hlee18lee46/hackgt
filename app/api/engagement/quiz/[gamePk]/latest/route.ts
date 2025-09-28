// app/api/engagement/quiz/[gamePk]/latest/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export async function OPTIONS() {
  return new Response(null, { headers: cors() });
}

type Ctx =
  | { params: { gamePk: string } }
  | { params: Promise<{ gamePk: string }> };

const nyNow = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));

export async function GET(req: Request, ctx: Ctx) {
  try {
    const p =
      "then" in (ctx as any).params
        ? await (ctx as any).params
        : (ctx as any).params;

    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const gamePk = Number(p.gamePk);
    if (!Number.isFinite(gamePk) || gamePk <= 0) {
      return NextResponse.json(
        { success: false, error: "Bad gamePk" },
        { status: 400, headers: cors() }
      );
    }

    const db = await getDb();
    const quizzes = db.collection("quizzes");

    const now = nyNow();

    // "Active" quiz definition:
    // - Not yet expired OR not yet revealed OR very recent creation (fallback)
    const recentWindowMs = 5 * 60 * 1000; // 5 minutes
    const recentCutoff = new Date(now.getTime() - recentWindowMs);

    const activeFilter = debug
      ? { gamePk } // return most recent regardless when debug=1
      : {
          gamePk,
          $or: [
            { expiresAt: { $gt: now } },
            { revealAt: { $gt: now } },
            { createdAt: { $gte: recentCutoff } },
          ],
        };

    const doc = await quizzes.findOne(activeFilter, { sort: { createdAt: -1 } });

    if (!doc) {
      return NextResponse.json(
        { success: true, quiz: null },
        { headers: cors() }
      );
    }

    const payload = {
      quizId: String(doc.quizId ?? doc._id),
      gamePk: Number(doc.gamePk),
      question: String(doc.question),
      options: Array.isArray(doc.options) ? doc.options.map(String) : [],
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
      revealAt: doc.revealAt ? new Date(doc.revealAt).toISOString() : undefined,
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : undefined,
      // correctIndex intentionally omitted here
    };

    return NextResponse.json({ success: true, quiz: payload }, { headers: cors() });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "latest failed" },
      { status: 500, headers: cors() }
    );
  }
}
