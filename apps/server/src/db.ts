import {createClient} from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs"; import path from "node:path";
const dataDir=path.resolve(process.cwd(),"../../data"); fs.mkdirSync(dataDir,{recursive:true});
export const sqlite=createClient({url:`file:${path.join(dataDir,"afterglow.db")}`});
await sqlite.batch(["CREATE TABLE IF NOT EXISTS library_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, vndb_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, personal_rating INTEGER, favorite INTEGER NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', started_at TEXT, completed_at TEXT, vn_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)","CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)","CREATE TABLE IF NOT EXISTS vn_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)"],"write");
export const db=drizzle(sqlite);
