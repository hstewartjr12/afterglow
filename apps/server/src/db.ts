import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Resolve from this file (src/ or dist/) so the database location does not depend on the working directory.
const dataDir = process.env.AFTERGLOW_DATA_DIR
  ? path.resolve(process.env.AFTERGLOW_DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
fs.mkdirSync(dataDir, { recursive: true });
export const sqlite = createClient({
  url: `file:${path.join(dataDir, "afterglow.db")}`,
});
await sqlite.batch(
  [
    "CREATE TABLE IF NOT EXISTS library_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, vndb_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, personal_rating INTEGER, favorite INTEGER NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', started_at TEXT, completed_at TEXT, vn_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS vn_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  ],
  "write",
);
// Expired entries are kept for a week as a fallback while VNDB is unreachable, then dropped.
await sqlite.execute({
  sql: "DELETE FROM vn_cache WHERE expires_at < ?",
  args: [Date.now() - 7 * 24 * 60 * 60 * 1000],
});
export const db = drizzle(sqlite);
