// lib/mongodb.ts
import { MongoClient, Db } from "mongodb";

// IMPORTANT: App Router routes using this must run on Node.js runtime
// export const runtime = "nodejs"  // add this in each route file, not here

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

async function ensureIndexes(db: Db) {
  if (globalForMongo.__mongo!.indexesReady) return;

  const games = db.collection("games");
  const chats = db.collection("game_chats");
  const teams = db.collection("mlb_teams");
  const standings = db.collection("mlb_standings");
  const playerStats = db.collection("mlb_player_stats");

  await Promise.all([
    // games live feed
    games.createIndex({ gamePk: 1 }, { unique: true }),
    games.createIndex({ date: 1 }),
    games.createIndex({ updatedAt: -1 }),

    // chat per game, time-ordered
    chats.createIndex({ gamePk: 1, ts: 1 }),

    // teams (unique id)
    teams.createIndex({ id: 1 }, { unique: true }),

    // standings per season/team
    standings.createIndex({ season: 1, teamId: 1 }, { unique: true }),
    standings.createIndex({ season: 1, league: 1, division: 1 }),

    // player stats per season
    playerStats.createIndex({ playerId: 1, season: 1 }, { unique: true }),
  ]);

  globalForMongo.__mongo!.indexesReady = true;
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
    });

  if (!globalForMongo.__mongo!.client) {
    await client.connect();
    globalForMongo.__mongo!.client = client;
  }

  const db = client.db(dbName);
  globalForMongo.__mongo!.db = db;

  // fire-and-forget is okay; but await once to guarantee availability
  await ensureIndexes(db);

  return db;
}
