// lib/mongodb.ts
import { MongoClient, Db } from "mongodb";

// IMPORTANT: App Router routes using this must run on Node.js runtime.
// Add in each route file (not here):
//   export const runtime = "nodejs";
//   export const dynamic = "force-dynamic";

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB ?? "mlb";
if (!uri) throw new Error("Missing MONGODB_URI");

type GlobalMongo = {
  client: MongoClient | null;
  db: Db | null;
  indexesReady?: boolean;
};

// Reuse across hot reloads / serverless invocations
const globalForMongo = globalThis as unknown as { __mongo?: GlobalMongo };
globalForMongo.__mongo ??= { client: null, db: null, indexesReady: false };

// Guard to prevent concurrent index creation on cold starts
let indexesPromise: Promise<void> | null = null;

async function ensureIndexes(db: Db) {
  if (globalForMongo.__mongo!.indexesReady) return;
  if (indexesPromise) return indexesPromise;

  indexesPromise = (async () => {
    const games        = db.collection("games");
    const chats        = db.collection("game_chats");
    const teams        = db.collection("mlb_teams");
    const standings    = db.collection("mlb_standings");
    const playerStats  = db.collection("mlb_player_stats");

    // NEW: quiz collections
    const quizQuestions = db.collection("quiz_questions");
    const quizVotes     = db.collection("quiz_votes");

    await Promise.all([
      // games (live feed & querying by date/status)
      games.createIndex({ gamePk: 1 }, { unique: true }),
      games.createIndex({ date: 1 }),
      games.createIndex({ updatedAt: -1 }),
      games.createIndex({ date: 1, status: 1 }),

      // chat per game, time-ordered (optionally add TTL if you want auto-prune)
      chats.createIndex({ gamePk: 1, ts: 1 }),
      // Example TTL (uncomment if desired):
      // chats.createIndex({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }),

      // teams (unique id)
      teams.createIndex({ id: 1 }, { unique: true }),

      // standings per season/team + helpful secondary
      standings.createIndex({ season: 1, teamId: 1 }, { unique: true }),
      standings.createIndex({ season: 1, league: 1, division: 1 }),

      // player stats per season
      playerStats.createIndex({ playerId: 1, season: 1 }, { unique: true }),
      playerStats.createIndex({ updatedAt: -1 }),

      // ---------- QUIZ INDEXES ----------
      // latest question lookup per game
      quizQuestions.createIndex({ gamePk: 1, createdAt: -1 }),
      // optional cleanup by expiry (if you set expiresAt)
      quizQuestions.createIndex({ gamePk: 1, expiresAt: 1 }),

      // one vote per user per question
      quizVotes.createIndex({ gamePk: 1, qid: 1, userKey: 1 }, { unique: true }),
      // aggregate answers quickly
      quizVotes.createIndex({ gamePk: 1, qid: 1, answer: 1 }),
      quizVotes.createIndex({ ts: -1 }),
    ]);

    globalForMongo.__mongo!.indexesReady = true;
  })();

  return indexesPromise;
}

export async function getDb(): Promise<Db> {
  if (globalForMongo.__mongo!.db) return globalForMongo.__mongo!.db!;

  const client =
    globalForMongo.__mongo!.client ??
    new MongoClient(uri, {
      // sensible timeouts for serverless
      maxPoolSize: 10,
      minPoolSize: 0,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      serverSelectionTimeoutMS: 10_000,
      retryWrites: true,
      appName: "livesports-api",
    });

  if (!globalForMongo.__mongo!.client) {
    await client.connect();
    globalForMongo.__mongo!.client = client;
  }

  const db = client.db(dbName);
  globalForMongo.__mongo!.db = db;

  // Ensure collections are ready before first use
  await ensureIndexes(db);

  return db;
}
