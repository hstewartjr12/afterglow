import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backupSchema,
  preferencesSchema,
  timestampSchema,
  type Backup,
  type LibraryEntry,
  type RecommendationFeedback,
  type VnSummary,
} from "@afterglow/shared";
import {
  createBackup,
  importUserBackup,
  quickWishlist,
  readFeedback,
  saveFeedback,
} from "./dataRoutes.js";

const storage = vi.hoisted(() => ({ client: undefined as unknown as Client }));
vi.mock("./db.js", async () => ({
  ...(await import("./databaseOperations.js")),
  get sqlite() {
    return storage.client;
  },
}));
const date = "2026-01-01T00:00:00.000Z";
const future = "2099-01-01T00:00:00.000Z";
const vn = (id = "v1"): VnSummary => ({
  id,
  title: `Story ${id}`,
  alttitle: null,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: "2024-01-01",
  rating: 80,
  voteCount: 100,
  length: 2,
  platforms: ["win"],
  tags: [],
});
const entry = (id = "v1", notes = "Original private notes"): LibraryEntry => ({
  id: Number(id.slice(1)),
  vndbId: id,
  vn: vn(id),
  status: "playing",
  personalRating: 9,
  favorite: true,
  progress: 65,
  notes,
  startedAt: "2026-01-01",
  completedAt: null,
  createdAt: date,
  updatedAt: date,
});
const feedback = (
  id = "v1",
  until: string | null = null,
): RecommendationFeedback => ({
  vndbId: id,
  vn: vn(id),
  until,
  createdAt: date,
});
const backup = (library: LibraryEntry[] = []): Backup => ({
  kind: "afterglow-backup",
  version: 1,
  exportedAt: date,
  library,
  preferences: preferencesSchema.parse({
    completed: true,
    tagPreferences: [{ id: "g1", name: "Mystery", weight: 3 }],
  }),
  feedback: [],
});
let directory: string;
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "afterglow-data-test-"));
  storage.client = createClient({
    url: `file:${path.join(directory, "test.db")}`,
  });
  await storage.client.executeMultiple(`
    CREATE TABLE library_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, vndb_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, personal_rating INTEGER, favorite INTEGER NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', started_at TEXT, completed_at TEXT, vn_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
});
afterEach(() => {
  storage.client.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("portable backups", () => {
  it("keeps existing notes, status and rating by default and restores new stories", async () => {
    await importUserBackup({
      backup: backup([entry()]),
      includePreferences: true,
    });
    const incoming = backup([
      entry("v1", "Older notes"),
      entry("v2", "Second story"),
    ]);
    incoming.preferences = preferencesSchema.parse({});
    expect(await importUserBackup({ backup: incoming })).toEqual({
      added: 1,
      updated: 0,
      kept: 1,
    });
    const saved = await createBackup();
    expect(saved.library.find((item) => item.vndbId === "v1")).toMatchObject({
      notes: "Original private notes",
      status: "playing",
      personalRating: 9,
      progress: 65,
      favorite: true,
    });
    expect(saved.library.find((item) => item.vndbId === "v2")?.notes).toBe(
      "Second story",
    );
    expect(saved.preferences.tagPreferences).toHaveLength(1);
  });

  it("overwrites only matching stories when explicitly selected and keeps local numeric identity", async () => {
    await importUserBackup({ backup: backup([entry(), entry("v2")]) });
    const previous = (await createBackup()).library.find(
      (item) => item.vndbId === "v1",
    )!;
    const incoming = entry("v1", "Restored notes");
    incoming.id = 500;
    incoming.status = "completed";
    incoming.progress = 100;
    incoming.personalRating = null;
    incoming.completedAt = "2026-02-02";
    expect(
      await importUserBackup({
        backup: backup([incoming]),
        overwrite: true,
        includePreferences: true,
      }),
    ).toEqual({ added: 0, updated: 1, kept: 0 });
    const saved = await createBackup();
    expect(saved.library).toHaveLength(2);
    expect(saved.library.find((item) => item.vndbId === "v1")).toMatchObject({
      ...incoming,
      id: previous.id,
    });
    expect(saved.preferences.tagPreferences[0].name).toBe("Mystery");
  });

  it("rejects incomplete personal data, ID mismatches and duplicates without changing anything", async () => {
    await importUserBackup({ backup: backup([entry()]) });
    const before = await createBackup();
    const missingNotes = { ...entry("v2"), notes: undefined };
    const invalid = [
      { ...backup([entry("v2")]), library: [missingNotes] },
      backup([entry("v2"), entry("v2")]),
      backup([{ ...entry("v2"), vn: vn("v3") }]),
      { ...backup(), preferences: {} },
      { ...backup(), feedback: [feedback("v3"), feedback("v3")] },
      { ...backup(), version: 2 },
    ];
    for (const candidate of invalid)
      await expect(
        importUserBackup({
          backup: candidate,
          overwrite: true,
          includePreferences: true,
        }),
      ).rejects.toThrow();
    const after = await createBackup();
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
  });

  it("rolls back earlier story writes if any write fails", async () => {
    await importUserBackup({
      backup: backup([entry()]),
      includePreferences: true,
    });
    await saveFeedback("v3", { vn: vn("v3"), until: null });
    const before = await createBackup();
    await storage.client.executeMultiple(
      `CREATE TRIGGER reject_second_story BEFORE INSERT ON library_entries WHEN NEW.vndb_id = 'v2' BEGIN SELECT RAISE(ABORT, 'write failed'); END;`,
    );
    const incoming = backup([entry("v1", "Must roll back"), entry("v2")]);
    incoming.preferences = preferencesSchema.parse({});
    incoming.feedback = [feedback("v4")];
    await expect(
      importUserBackup({
        backup: incoming,
        overwrite: true,
        includePreferences: true,
      }),
    ).rejects.toThrow("write failed");
    const after = await createBackup();
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
    // A failed transaction must not poison the transaction queue.
    expect((await quickWishlist("v5", vn("v5"))).created).toBe(true);
  });

  it("merges active feedback, keeps conflicts by default and ignores expired dismissals", async () => {
    await saveFeedback("v1", { vn: vn(), until: null });
    const incoming = backup();
    incoming.feedback = [
      feedback("v1", future),
      feedback("v2", future),
      feedback("v3", date),
    ];
    await importUserBackup({ backup: incoming });
    expect(await readFeedback()).toMatchObject([
      { vndbId: "v1", until: null },
      { vndbId: "v2", until: future },
    ]);
    await importUserBackup({ backup: incoming, overwrite: true });
    expect(await readFeedback()).toMatchObject([
      { vndbId: "v1", until: future },
      { vndbId: "v2", until: future },
    ]);
  });

  it("rejects unreadable timestamp offsets without changing saved feedback", async () => {
    await saveFeedback("v1", { vn: vn(), until: null });
    const before = await createBackup();
    for (const offset of ["+99:99", "+24:00", "+01:99"]) {
      const until = `2099-01-01T00:00:00${offset}`;
      expect(timestampSchema.safeParse(until).success).toBe(false);
      await expect(saveFeedback("v1", { vn: vn(), until })).rejects.toThrow(
        "Invalid timestamp",
      );
      await expect(
        importUserBackup({
          backup: { ...backup(), feedback: [feedback("v2", until)] },
        }),
      ).rejects.toThrow("Invalid timestamp");
    }
    const after = await createBackup();
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
    expect(timestampSchema.safeParse("2099-01-01T00:00:00+05:30").success).toBe(
      true,
    );
  });

  it("exports empty defaults when personal data is absent and refuses a misleading backup when stored data is corrupt", async () => {
    const empty = await createBackup();
    expect(backupSchema.safeParse(empty).success).toBe(true);
    expect(empty.library).toEqual([]);
    expect(empty.feedback).toEqual([]);
    expect(empty.preferences).toEqual(preferencesSchema.parse({}));
    await storage.client.execute({
      sql: "INSERT INTO app_settings (key, value) VALUES (?, ?)",
      args: ["recommendation-feedback", "broken JSON"],
    });
    expect(await readFeedback()).toEqual([]);
    await expect(createBackup()).rejects.toThrow(
      "recommendation feedback could not be read",
    );
    expect(
      (await storage.client.execute("SELECT value FROM app_settings")).rows[0]
        .value,
    ).toBe("broken JSON");
  });
});

describe("safe quick wishlist", () => {
  it("creates one entry under concurrent clicks, and never overwrites existing reading data", async () => {
    const results = await Promise.all([
      quickWishlist("v1", vn()),
      quickWishlist("v1", vn()),
    ]);
    expect(results.map((result) => result.created).sort()).toEqual([
      false,
      true,
    ]);
    expect((await createBackup()).library).toHaveLength(1);
    await importUserBackup({ backup: backup([entry()]), overwrite: true });
    const before = await createBackup();
    const result = await quickWishlist("v1", {
      ...vn(),
      title: "Changed story metadata",
    });
    expect(result.created).toBe(false);
    expect(result.entry).toMatchObject({
      notes: "Original private notes",
      status: "playing",
      personalRating: 9,
      progress: 65,
      favorite: true,
    });
    const after = await createBackup();
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
  });
});
