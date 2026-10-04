import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { preferencesSchema, type LibraryInput } from "@afterglow/shared";
import { storage } from "./storage";
const input: LibraryInput = {
  status: "backlog",
  personalRating: null,
  favorite: false,
  progress: 0,
  notes: "Private test note",
  startedAt: null,
  completedAt: null,
  vn: {
    id: "v17",
    title: "Ever17",
    imageUrl: null,
    imageSexual: 0,
    imageViolence: 0,
    released: "2002-08-29",
    rating: 85,
    voteCount: 100,
    length: 3,
    platforms: ["win"],
    tags: [],
  },
};
afterEach(() => storage.reset());
describe("visitor browser storage", () => {
  it("saves, updates and removes a title while preserving its identity", async () => {
    const saved = await storage.saveLibrary("v17", input);
    expect(await storage.library()).toEqual([saved]);
    const updated = await storage.saveLibrary("v17", {
      ...input,
      status: "completed",
      personalRating: 9,
      progress: 100,
    });
    expect(updated.id).toBe(saved.id);
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(await storage.library()).toHaveLength(1);
    expect((await storage.library())[0].personalRating).toBe(9);
    await storage.removeLibrary("v17");
    expect(await storage.library()).toEqual([]);
  });
  it("stores taste separately and resets both stores together", async () => {
    const preferences = preferencesSchema.parse({
      completed: true,
      tagPreferences: [{ id: "g1", name: "Mystery", weight: 3 }],
    });
    await Promise.all([
      storage.saveLibrary("v17", input),
      storage.savePreferences(preferences),
    ]);
    expect(await storage.preferences()).toEqual(preferences);
    await storage.reset();
    expect(await storage.library()).toEqual([]);
    expect(await storage.preferences()).toEqual(preferencesSchema.parse({}));
  });
  it("rejects invalid input without modifying saved data", async () => {
    await storage.saveLibrary("v17", input);
    await expect(storage.saveLibrary("v18", input)).rejects.toThrow(
      "Invalid visual novel",
    );
    expect(() =>
      storage.savePreferences({
        ...preferencesSchema.parse({}),
        tagPreferences: [{ id: "g1", name: "Mystery", weight: 99 }],
      }),
    ).toThrow();
    expect(await storage.library()).toHaveLength(1);
    expect((await storage.preferences()).tagPreferences).toEqual([]);
  });
});

describe("backup and recommendation choices", () => {
  it("atomically wishlists only absent stories and keeps existing tracker fields", async () => {
    const saved = await storage.saveLibrary("v17", {
      ...input,
      status: "playing",
      personalRating: 9,
      favorite: true,
      notes: "Keep this note",
    });
    const [first, second] = await Promise.all([
      storage.quickWishlist(input.vn),
      storage.quickWishlist(input.vn),
    ]);
    expect(first).toEqual({ entry: saved, created: false });
    expect(second).toEqual(first);
    await storage.reset();
    const results = await Promise.all([
      storage.quickWishlist(input.vn),
      storage.quickWishlist(input.vn),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect((await storage.library())[0].status).toBe("wishlist");
  });
  it("exports personal data and merges a backup without replacing existing notes or profile", async () => {
    await storage.saveLibrary("v17", input);
    const prefs = preferencesSchema.parse({
      completed: true,
      preferredLengths: [4],
    });
    await storage.savePreferences(prefs);
    await storage.saveFeedback(input.vn, null);
    const backup = await storage.backup();
    await storage.saveLibrary("v17", { ...input, notes: "Newer note" });
    await storage.savePreferences(
      preferencesSchema.parse({ preferredLengths: [1] }),
    );
    expect(
      await storage.importBackup({
        backup,
        overwrite: false,
        includePreferences: false,
      }),
    ).toEqual({ added: 0, updated: 0, kept: 1 });
    expect((await storage.library())[0].notes).toBe("Newer note");
    expect((await storage.preferences()).preferredLengths).toEqual([1]);
    expect(
      await storage.importBackup({
        backup,
        overwrite: true,
        includePreferences: true,
      }),
    ).toEqual({ added: 0, updated: 1, kept: 0 });
    expect((await storage.library())[0].notes).toBe(input.notes);
    expect(await storage.preferences()).toEqual(prefs);
    expect(await storage.feedback()).toHaveLength(1);
    await storage.reset();
    expect(await storage.feedback()).toEqual([]);
    expect(
      await storage.importBackup({
        backup,
        overwrite: false,
        includePreferences: true,
      }),
    ).toEqual({ added: 1, updated: 0, kept: 0 });
    expect((await storage.library())[0].notes).toBe(input.notes);
  });
  it("validates malformed backups before writes and drops expired postponements", async () => {
    await storage.saveLibrary("v17", input);
    const before = await storage.backup();
    expect(() =>
      storage.importBackup({
        backup: { ...before, library: [...before.library, ...before.library] },
        overwrite: true,
        includePreferences: true,
      }),
    ).toThrow();
    expect((await storage.library())[0].notes).toBe(input.notes);
    await storage.saveFeedback(input.vn, "2020-01-01T00:00:00.000Z");
    expect(await storage.feedback()).toEqual([]);
    expect(() =>
      storage.saveFeedback(input.vn, "2099-01-01T00:00:00+99:99"),
    ).toThrow();
  });
  it("rolls back library and profile writes together when feedback cannot be merged", async () => {
    await storage.saveLibrary("v17", input);
    await storage.saveFeedback(input.vn, null);
    const backup = await storage.backup();
    backup.library[0].notes = "Would replace this note";
    backup.preferences = preferencesSchema.parse({ preferredLengths: [5] });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("afterglow-demo-v1", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put(
          { broken: true },
          "recommendation-feedback",
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    await expect(
      storage.importBackup({
        backup,
        overwrite: true,
        includePreferences: true,
      }),
    ).rejects.toThrow("could not be read");
    expect((await storage.library())[0].notes).toBe(input.notes);
    expect((await storage.preferences()).preferredLengths).toEqual([]);
  });
});
