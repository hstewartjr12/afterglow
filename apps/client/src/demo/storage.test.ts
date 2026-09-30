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
