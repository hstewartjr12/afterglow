import { describe, expect, it } from "vitest";
import type { LibraryEntry, Preferences, VnSummary } from "./index.ts";
import { recommendationSeeds, recommendationTagIds } from "./candidates.ts";

const prefs: Preferences = {
  tagPreferences: [],
  preferredLengths: [],
  preferredPlatforms: [],
  useSpoilerTagsInRecommendations: false,
  completed: false,
};
const entry = (
  tags: VnSummary["tags"],
  changes: Partial<LibraryEntry> = {},
): LibraryEntry => ({
  id: 1,
  vndbId: "v1",
  status: "completed",
  personalRating: null,
  favorite: false,
  progress: 100,
  notes: "",
  startedAt: null,
  completedAt: null,
  createdAt: "",
  updatedAt: "",
  vn: {
    id: "v1",
    title: "Story",
    imageUrl: null,
    imageSexual: 0,
    imageViolence: 0,
    released: null,
    rating: 80,
    voteCount: 100,
    length: 3,
    platforms: ["win"],
    tags,
  },
  ...changes,
});
const tag = (id: string, rating = 3, spoiler = 0) => ({
  id,
  name: id,
  rating,
  spoiler,
});

describe("recommendation retrieval seeds", () => {
  it("rotates across all Loves and otherwise focuses the strongest learned theme", () => {
    const tags = Array.from({ length: 10 }, (_, i) => ({
      ...tag(`g${i + 1}`),
      weight: 3,
    }));
    const library = [entry([tag("g99"), tag("g98", 1)], { favorite: true })];
    expect(
      recommendationSeeds(library, { ...prefs, tagPreferences: tags }, 9).focus,
    ).toBe("g10");
    expect(
      recommendationSeeds(library, { ...prefs, tagPreferences: tags }, 10)
        .focus,
    ).toBe("g1");
    expect(recommendationSeeds(library, prefs).focus).toBe("g99");
    expect(
      recommendationSeeds([], { ...prefs, tagPreferences: tags.slice(0, 1) })
        .focus,
    ).toBeUndefined();
  });

  it("uses highly rated and favorite themes without requiring manual preferences", () => {
    const library = [
      entry([tag("g1")], { personalRating: 10 }),
      entry([tag("g2")], { favorite: true }),
      entry([tag("g3")]),
    ];
    expect(recommendationTagIds(library, prefs)).toEqual(["g1", "g2"]);
  });
  it("never seeds avoided themes, dropped stories, low ratings or malformed IDs", () => {
    const library = [
      entry([tag("g1"), tag("g2"), tag("bad")], { favorite: true }),
      entry([tag("g3")], {
        favorite: true,
        personalRating: 10,
        status: "dropped",
      }),
      entry([tag("g4")], { favorite: true, personalRating: 2 }),
      entry([tag("g5")], { favorite: true, personalRating: 4 }),
    ];
    expect(
      recommendationTagIds(library, {
        ...prefs,
        tagPreferences: [
          { id: "g1", name: "Avoided", weight: -3 },
          { id: "g1", name: "Conflicting", weight: 3 },
        ],
      }),
    ).toEqual(["g2"]);
  });
  it("respects spoiler opt-in for learned themes", () => {
    const library = [entry([tag("g1", 3, 2)], { favorite: true })];
    expect(recommendationTagIds(library, prefs)).toEqual([]);
    expect(
      recommendationTagIds(library, {
        ...prefs,
        useSpoilerTagsInRecommendations: true,
      }),
    ).toEqual(["g1"]);
  });
  it("weights evidence by relevance and multiple stories without counting duplicate tags twice", () => {
    const library = [
      entry([tag("g1", 1), tag("g1", 1), tag("g1", 1), tag("g2", 2)], {
        favorite: true,
      }),
      entry([tag("g3", 1)], { personalRating: 10 }),
      entry([tag("g3", 1)], { favorite: true }),
    ];
    expect(recommendationTagIds(library, prefs)).toEqual(["g3", "g2", "g1"]);
  });
  it("keeps manual themes first and mixes learned themes into eight unique seeds without mutating inputs", () => {
    const manual: Preferences = {
      ...prefs,
      tagPreferences: Array.from({ length: 9 }, (_, i) => ({
        id: `g${i + 1}`,
        name: `Theme ${i + 1}`,
        weight: 3,
      })),
    };
    const library = [
      entry([tag("g20"), tag("g21"), tag("g1")], { favorite: true }),
    ];
    const before = JSON.stringify([library, manual]);
    expect(recommendationTagIds(library, manual)).toEqual([
      "g1",
      "g2",
      "g3",
      "g4",
      "g5",
      "g6",
      "g20",
      "g21",
    ]);
    expect(JSON.stringify([library, manual])).toBe(before);
    expect(recommendationTagIds([], manual)).toEqual([
      "g1",
      "g2",
      "g3",
      "g4",
      "g5",
      "g6",
      "g7",
      "g8",
    ]);
  });
});
