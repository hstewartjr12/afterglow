import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const libraryEntries = sqliteTable("library_entries", {
  id: integer("id").primaryKey({autoIncrement:true}), vndbId:text("vndb_id").notNull().unique(), status:text("status").notNull(),
  personalRating:integer("personal_rating"), favorite:integer("favorite",{mode:"boolean"}).notNull().default(false), progress:integer("progress").notNull().default(0),
  notes:text("notes").notNull().default(""), startedAt:text("started_at"), completedAt:text("completed_at"), vnJson:text("vn_json").notNull(),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull()
});
export const appSettings = sqliteTable("app_settings", {key:text("key").primaryKey(), value:text("value").notNull()});
export const vnCache = sqliteTable("vn_cache", {key:text("key").primaryKey(), value:text("value").notNull(), expiresAt:integer("expires_at").notNull()});
