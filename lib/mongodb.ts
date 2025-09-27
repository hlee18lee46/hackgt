import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB ?? "mlb";

if (!uri) throw new Error("Missing MONGODB_URI");

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  client = client ?? new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  // Ensure indexes
  const games = db.collection("games");
  await Promise.all([
    games.createIndex({ gamePk: 1 }, { unique: true }),
    games.createIndex({ updatedAt: -1 }),
    games.createIndex({ date: 1 }),
  ]);

  return db;
}
