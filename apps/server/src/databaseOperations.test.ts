import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preferencesSchema, type VnSummary } from "@afterglow/shared";
import { appSettings, libraryEntries } from "./schema.js";

const date = "2026-01-01T00:00:00.000Z";
const vn: VnSummary = {
  id: "v1",
  title: "A saved story",
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: null,
  rating: 80,
  voteCount: 100,
  length: 2,
  platforms: ["win"],
  tags: [],
};

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let directory: string;
let database: typeof import("./db.js") | undefined;
let routes: typeof import("./dataRoutes.js");

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "afterglow-operation-test-"));
  vi.stubEnv("AFTERGLOW_DATA_DIR", directory);
  vi.resetModules();
  database = await import("./db.js");
  routes = await import("./dataRoutes.js");
});

afterEach(() => {
  database?.sqlite.close();
  database = undefined;
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("shared database operation queue", () => {
  it("holds direct writes and backup reads until a native transaction commits", async () => {
    const { db, sqlite, serializeDatabaseOperation } = database!;
    const started = gate();
    const release = gate();
    const events: string[] = [];
    const profile = preferencesSchema.parse({
      completed: true,
      tagPreferences: [{ id: "g1", name: "Mystery", weight: 3 }],
    });
    const heldTransaction = serializeDatabaseOperation(async () => {
      const tx = await sqlite.transaction("write");
      try {
        await tx.execute({
          sql: "INSERT INTO library_entries (vndb_id, status, personal_rating, favorite, progress, notes, vn_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          args: [
            vn.id,
            "playing",
            8,
            1,
            70,
            "Transaction notes",
            JSON.stringify(vn),
            date,
            date,
          ],
        });
        events.push("transaction started");
        started.resolve();
        await release.promise;
        await tx.commit();
        events.push("transaction committed");
      } finally {
        tx.close();
      }
    });
    await started.promise;

    // Return the Drizzle thenable directly, as the existing library routes do.
    const libraryWrite = serializeDatabaseOperation(() => {
      events.push("library write");
      return db
        .update(libraryEntries)
        .set({ notes: "Later saved notes", personalRating: 10 })
        .where(eq(libraryEntries.vndbId, vn.id))
        .returning();
    });
    const preferencesWrite = serializeDatabaseOperation(() => {
      events.push("preferences write");
      return db.insert(appSettings).values({
        key: "preferences",
        value: JSON.stringify(profile),
      });
    });
    const cacheWrite = serializeDatabaseOperation(() => {
      events.push("cache write");
      return sqlite.execute({
        sql: "INSERT INTO vn_cache (key, value, expires_at) VALUES (?, ?, ?)",
        args: ["queued-cache", JSON.stringify(vn), Date.now() + 60_000],
      });
    });
    const backupRead = routes.createBackup().then((backup) => {
      events.push("backup read");
      return backup;
    });
    // Observe every rejection immediately, including if a regression starts
    // another native transaction while the first one still holds a connection.
    const completion = Promise.allSettled([
      heldTransaction,
      libraryWrite,
      preferencesWrite,
      cacheWrite,
      backupRead,
    ]);
    let outcomes: Awaited<typeof completion>;
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(events).toEqual(["transaction started"]);
    } finally {
      release.resolve();
      outcomes = await completion;
    }

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(
      true,
    );
    expect(events).toEqual([
      "transaction started",
      "transaction committed",
      "library write",
      "preferences write",
      "cache write",
      "backup read",
    ]);
    const backup = await backupRead;
    expect(backup.library).toHaveLength(1);
    expect(backup.library[0]).toMatchObject({
      vndbId: vn.id,
      status: "playing",
      favorite: true,
      progress: 70,
      notes: "Later saved notes",
      personalRating: 10,
    });
    expect(backup.preferences).toEqual(profile);
    expect(
      (
        await sqlite.execute(
          "SELECT value FROM vn_cache WHERE key = 'queued-cache'",
        )
      ).rows[0]?.value,
    ).toBe(JSON.stringify(vn));
  });

  it("continues queued writes and transactions after a failed operation rolls back", async () => {
    const { db, sqlite, serializeDatabaseOperation } = database!;
    const started = gate();
    const release = gate();
    const events: string[] = [];
    const failedTransaction = serializeDatabaseOperation(async () => {
      const tx = await sqlite.transaction("write");
      try {
        await tx.execute({
          sql: "INSERT INTO app_settings (key, value) VALUES (?, ?)",
          args: ["must-roll-back", "uncommitted value"],
        });
        events.push("failed transaction started");
        started.resolve();
        await release.promise;
        throw new Error("Deliberate operation failure");
      } finally {
        tx.close();
      }
    });
    await started.promise;
    const profile = preferencesSchema.parse({ completed: true });
    const directWrite = serializeDatabaseOperation(() => {
      events.push("direct write");
      return db.insert(appSettings).values({
        key: "preferences",
        value: JSON.stringify(profile),
      });
    });
    const wishlistWrite = routes.quickWishlist(vn.id, vn).then((result) => {
      events.push("wishlist write");
      return result;
    });
    const backupRead = routes.createBackup().then((backup) => {
      events.push("backup read");
      return backup;
    });
    const completion = Promise.allSettled([
      failedTransaction,
      directWrite,
      wishlistWrite,
      backupRead,
    ]);
    let outcomes: Awaited<typeof completion>;
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(events).toEqual(["failed transaction started"]);
    } finally {
      release.resolve();
      outcomes = await completion;
    }

    expect(outcomes[0]).toMatchObject({
      status: "rejected",
      reason: new Error("Deliberate operation failure"),
    });
    expect(
      outcomes.slice(1).every((outcome) => outcome.status === "fulfilled"),
    ).toBe(true);
    expect(events).toEqual([
      "failed transaction started",
      "direct write",
      "wishlist write",
      "backup read",
    ]);
    expect((await wishlistWrite).created).toBe(true);
    const backup = await backupRead;
    expect(backup.library[0]).toMatchObject({
      vndbId: vn.id,
      status: "wishlist",
    });
    expect(backup.preferences).toEqual(profile);
    expect(
      (
        await sqlite.execute(
          "SELECT key FROM app_settings WHERE key = 'must-roll-back'",
        )
      ).rows,
    ).toEqual([]);
  });
});
