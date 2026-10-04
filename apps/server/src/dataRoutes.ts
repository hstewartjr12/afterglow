import type { Express, RequestHandler } from "express";
import type { Client, Row, Transaction } from "@libsql/client";
import { z } from "zod";
import {
  backupImportSchema,
  backupLibraryEntrySchema,
  backupSchema,
  feedbackListSchema,
  libraryInputSchema,
  MAX_BACKUP_BYTES,
  preferencesSchema,
  recommendationFeedbackSchema,
  timestampSchema,
  vndbIdSchema,
  vnSummarySchema,
  type Backup,
  type BackupImportResult,
  type LibraryEntry,
  type RecommendationFeedback,
} from "@afterglow/shared";
import { serializeDatabaseOperation, sqlite } from "./db.js";

type Executor = Pick<Client | Transaction, "execute">;
const FEEDBACK_KEY = "recommendation-feedback";

class UnreadableDataError extends Error {
  constructor(data: string) {
    super(`Your saved ${data} could not be read. No data was changed.`);
  }
}

async function runTransaction<T>(
  mode: "read" | "write",
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await sqlite.transaction(mode);
  try {
    const result = await run(tx);
    await tx.commit();
    return result;
  } finally {
    // close() rolls back an uncommitted transaction, including failed imports.
    tx.close();
  }
}

function transaction<T>(
  mode: "read" | "write",
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  // Local libsql transactions hold a connection across awaits. Share the queue
  // with ordinary tracker, preference and catalogue-cache writes.
  return serializeDatabaseOperation(() => runTransaction(mode, run));
}

async function setting(executor: Executor, key: string) {
  const result = await executor.execute({
    sql: "SELECT value FROM app_settings WHERE key = ?",
    args: [key],
  });
  return result.rows[0]?.value;
}

async function writeSetting(executor: Executor, key: string, value: unknown) {
  await executor.execute({
    sql: "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [key, JSON.stringify(value)],
  });
}

function storedJson(value: unknown, label: string): unknown {
  try {
    if (typeof value !== "string") throw new Error("Expected saved JSON");
    return JSON.parse(value);
  } catch {
    throw new UnreadableDataError(label);
  }
}

function libraryEntry(row: Row): LibraryEntry {
  const value = {
    id: Number(row.id),
    vndbId: row.vndb_id,
    status: row.status,
    personalRating: row.personal_rating,
    favorite:
      row.favorite === 1 ? true : row.favorite === 0 ? false : row.favorite,
    progress: row.progress,
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    vn: storedJson(row.vn_json, "library"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const parsed = backupLibraryEntrySchema.safeParse(value);
  if (!parsed.success) throw new UnreadableDataError("library");
  return parsed.data;
}

async function storedFeedback(
  executor: Executor,
): Promise<RecommendationFeedback[]> {
  const value = await setting(executor, FEEDBACK_KEY);
  if (value === undefined) return [];
  const parsed = feedbackListSchema.safeParse(
    storedJson(value, "recommendation feedback"),
  );
  if (!parsed.success) throw new UnreadableDataError("recommendation feedback");
  return parsed.data;
}

export function activeFeedback(
  feedback: RecommendationFeedback[],
  now = Date.now(),
) {
  return feedback.filter(
    (entry) => entry.until === null || Date.parse(entry.until) > now,
  );
}

/** Corrupt optional feedback must not prevent the recommendation page loading. */
export async function readFeedback(): Promise<RecommendationFeedback[]> {
  try {
    return activeFeedback(await storedFeedback(sqlite));
  } catch (error) {
    if (error instanceof UnreadableDataError) return [];
    throw error;
  }
}

export function mergeFeedback(
  existing: RecommendationFeedback[],
  incoming: RecommendationFeedback[],
  overwrite = false,
  now = Date.now(),
) {
  const merged = new Map(
    activeFeedback(existing, now).map((entry) => [entry.vndbId, entry]),
  );
  for (const entry of activeFeedback(incoming, now)) {
    if (overwrite || !merged.has(entry.vndbId)) merged.set(entry.vndbId, entry);
  }
  return [...merged.values()];
}

export async function createBackup(): Promise<Backup> {
  return transaction("read", async (tx) => {
    const rows = await tx.execute(
      "SELECT * FROM library_entries ORDER BY updated_at DESC",
    );
    const savedPreferences = await setting(tx, "preferences");
    const parsedPreferences = preferencesSchema.safeParse(
      savedPreferences === undefined
        ? {}
        : storedJson(savedPreferences, "taste profile"),
    );
    if (!parsedPreferences.success)
      throw new UnreadableDataError("taste profile");
    return backupSchema.parse({
      kind: "afterglow-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      library: rows.rows.map(libraryEntry),
      preferences: parsedPreferences.data,
      feedback: activeFeedback(await storedFeedback(tx)),
    });
  });
}

const libraryColumns =
  "status, personal_rating, favorite, progress, notes, started_at, completed_at, vn_json, created_at, updated_at";
function libraryValues(entry: LibraryEntry) {
  return [
    entry.status,
    entry.personalRating,
    entry.favorite ? 1 : 0,
    entry.progress,
    entry.notes,
    entry.startedAt,
    entry.completedAt,
    JSON.stringify(entry.vn),
    entry.createdAt,
    entry.updatedAt,
  ];
}

export async function importUserBackup(
  value: unknown,
): Promise<BackupImportResult> {
  // Validate the entire payload before opening a transaction or changing data.
  const input = backupImportSchema.parse(value);
  if (
    Buffer.byteLength(JSON.stringify(input.backup), "utf8") > MAX_BACKUP_BYTES
  )
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["backup"],
        message: "The backup is larger than 10 MB. No data was changed.",
      },
    ]);
  return transaction("write", async (tx) => {
    const existing = await tx.execute("SELECT vndb_id FROM library_entries");
    const ids = new Set(existing.rows.map((entry) => String(entry.vndb_id)));
    const result: BackupImportResult = { added: 0, updated: 0, kept: 0 };
    for (const entry of input.backup.library) {
      if (ids.has(entry.vndbId)) {
        if (!input.overwrite) {
          result.kept++;
          continue;
        }
        await tx.execute({
          sql: `UPDATE library_entries SET ${libraryColumns
            .split(", ")
            .map((column) => `${column} = ?`)
            .join(", ")} WHERE vndb_id = ?`,
          args: [...libraryValues(entry), entry.vndbId],
        });
        result.updated++;
      } else {
        await tx.execute({
          sql: `INSERT INTO library_entries (vndb_id, ${libraryColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [entry.vndbId, ...libraryValues(entry)],
        });
        result.added++;
      }
    }
    if (input.includePreferences)
      await writeSetting(tx, "preferences", input.backup.preferences);
    if (input.backup.feedback.length) {
      const merged = mergeFeedback(
        await storedFeedback(tx),
        input.backup.feedback,
        input.overwrite,
      );
      await writeSetting(tx, FEEDBACK_KEY, merged);
    }
    return result;
  });
}

const feedbackInputSchema = z.object({
  vn: vnSummarySchema.extend({ id: vndbIdSchema }),
  until: timestampSchema.nullable(),
});

export async function saveFeedback(
  id: string,
  value: unknown,
): Promise<RecommendationFeedback> {
  const vndbId = vndbIdSchema.parse(id);
  const input = feedbackInputSchema.parse(value);
  if (input.vn.id !== vndbId)
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["vn", "id"],
        message: "The feedback VNDB ID must match its story",
      },
    ]);
  return transaction("write", async (tx) => {
    const feedback = activeFeedback(await storedFeedback(tx));
    const entry = recommendationFeedbackSchema.parse({
      vndbId,
      ...input,
      createdAt:
        feedback.find((item) => item.vndbId === vndbId)?.createdAt ??
        new Date().toISOString(),
    });
    await writeSetting(tx, FEEDBACK_KEY, [
      ...feedback.filter((item) => item.vndbId !== vndbId),
      entry,
    ]);
    return entry;
  });
}

export async function quickWishlist(id: string, value: unknown) {
  const vndbId = vndbIdSchema.parse(id);
  const vn = vnSummarySchema.extend({ id: vndbIdSchema }).parse(value);
  if (vn.id !== vndbId)
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["vn", "id"],
        message: "The library VNDB ID must match its story",
      },
    ]);
  const input = libraryInputSchema.parse({ status: "wishlist", vn });
  const now = new Date().toISOString();
  const entry: LibraryEntry = {
    id: 1,
    vndbId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  return transaction("write", async (tx) => {
    const result = await tx.execute({
      sql: `INSERT INTO library_entries (vndb_id, ${libraryColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(vndb_id) DO NOTHING`,
      args: [vndbId, ...libraryValues(entry)],
    });
    const rows = await tx.execute({
      sql: "SELECT * FROM library_entries WHERE vndb_id = ?",
      args: [vndbId],
    });
    return {
      entry: libraryEntry(rows.rows[0]),
      created: result.rowsAffected === 1,
    };
  });
}

function dataRoute(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error instanceof UnreadableDataError)
        res.status(500).json({ error: error.message, code: "UNREADABLE_DATA" });
      else throw error;
    }
  };
}

export function registerDataRoutes(app: Express) {
  app.get(
    "/api/feedback",
    dataRoute(async (_req, res) => {
      res.json(activeFeedback(await storedFeedback(sqlite)));
    }),
  );
  app.get(
    "/api/feedback/:id",
    dataRoute(async (req, res) => {
      const id = vndbIdSchema.parse(req.params.id);
      res.json(
        activeFeedback(await storedFeedback(sqlite)).find(
          (entry) => entry.vndbId === id,
        ) ?? null,
      );
    }),
  );
  app.put(
    "/api/feedback/:id",
    dataRoute(async (req, res) => {
      res.json(await saveFeedback(vndbIdSchema.parse(req.params.id), req.body));
    }),
  );
  app.delete(
    "/api/feedback/:id",
    dataRoute(async (req, res) => {
      const id = vndbIdSchema.parse(req.params.id);
      await transaction("write", async (tx) => {
        const feedback = activeFeedback(await storedFeedback(tx)).filter(
          (entry) => entry.vndbId !== id,
        );
        await writeSetting(tx, FEEDBACK_KEY, feedback);
      });
      res.status(204).end();
    }),
  );
  app.get(
    "/api/backup",
    dataRoute(async (_req, res) => {
      res.json(await createBackup());
    }),
  );
  app.post(
    "/api/backup/import",
    dataRoute(async (req, res) => {
      res.json(await importUserBackup(req.body));
    }),
  );
  app.put(
    "/api/library/:id/wishlist",
    dataRoute(async (req, res) => {
      res.json(
        await quickWishlist(vndbIdSchema.parse(req.params.id), req.body?.vn),
      );
    }),
  );
}
