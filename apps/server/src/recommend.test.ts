import { describe, expect, it } from "vitest";
import { rankRecommendations } from "./recommend.js";
import type { LibraryEntry, Preferences, VnSummary } from "@afterglow/shared";

const vn = (
  id: string,
  tags: { id: string; name: string; rating?: number; spoiler?: number }[],
  rating = 80,
  voteCount = 500,
): VnSummary => ({
  id,
  title: id,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: null,
  rating,
  voteCount,
  length: 3,
  platforms: ["win"],
  tags: tags.map((t) => ({
    ...t,
    rating: t.rating ?? 3,
    spoiler: t.spoiler ?? 0,
  })),
});
const prefs: Preferences = {
  tagPreferences: [{ id: "g1", name: "Mystery", weight: 3 }],
  preferredLengths: [3],
  preferredPlatforms: ["win"],
  useSpoilerTagsInRecommendations: false,
  completed: true,
};
const entry = (
  story: VnSummary,
  overrides: Partial<LibraryEntry> = {},
): LibraryEntry => ({
  id: 1,
  vndbId: story.id,
  vn: story,
  status: "completed",
  personalRating: 9,
  favorite: true,
  progress: 100,
  notes: "",
  startedAt: null,
  completedAt: null,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

describe("rankRecommendations", () => {
  it("prefers matching themes and excludes owned titles", () => {
    const ranked = rankRecommendations(
      [
        vn("v1", [{ id: "g2", name: "Horror" }]),
        vn("v2", [{ id: "g1", name: "Mystery" }]),
      ],
      [],
      prefs,
    );
    expect(ranked[0].vn.id).toBe("v2");
    expect(ranked[0].reasons.join(" ")).toContain("Mystery");
  });
  it("provides a quality-led but confidence-muted fallback", () => {
    const empty = {
      ...prefs,
      tagPreferences: [],
      preferredLengths: [],
      preferredPlatforms: [],
      completed: false,
    };
    const high = rankRecommendations([vn("v1", [], 90, 10000)], [], empty)[0];
    const low = rankRecommendations([vn("v2", [], 60, 10)], [], empty)[0];
    expect(high.matchPercent).toBeGreaterThan(low.matchPercent);
    expect(high.matchPercent).toBeLessThan(65);
    expect(low.matchPercent).toBeGreaterThan(40);
  });
  it("penalizes avoided tags instead of saturating matches", () => {
    const tailored = {
      ...prefs,
      tagPreferences: [
        ...prefs.tagPreferences,
        { id: "g3", name: "Gore", weight: -3 },
      ],
    };
    const clean = rankRecommendations(
      [
        vn("v1", [{ id: "g1", name: "Mystery" }]),
        vn("v2", [
          { id: "g1", name: "Mystery" },
          { id: "g3", name: "Gore" },
        ]),
      ],
      [],
      tailored,
    );
    expect(clean[0].vn.id).toBe("v1");
    expect(clean[0].matchPercent - clean[1].matchPercent).toBeGreaterThan(15);
    expect(clean[0].matchPercent).toBeLessThan(95);
  });
  it("rewards Love more than Like even with a single preference", () => {
    const title = vn("v1", [{ id: "g1", name: "Mystery" }]);
    const score = (weight: number) =>
      rankRecommendations([title], [], {
        ...prefs,
        tagPreferences: [{ id: "g1", name: "Mystery", weight }],
      })[0].score;
    expect(score(3)).toBeGreaterThan(score(1));
  });

  it("keeps the strongest avoid penalty and explains the most influential visible matches first", () => {
    const tags = [
      { id: "g1", name: "Comedy", weight: 1, rating: 1 },
      { id: "g2", name: "Drama", weight: 3, rating: 2 },
      { id: "g3", name: "Mystery", weight: 3, rating: 3 },
      { id: "g4", name: "Violence", weight: -3, rating: 1 },
      { id: "g5", name: "Gore", weight: -3, rating: 2 },
    ];
    const title = vn("v1", tags);
    // Equal preference counts isolate scoring from profile confidence.
    const rank = (id: string) =>
      rankRecommendations([title], [], {
        ...prefs,
        tagPreferences: tags.map((tag) =>
          tag.id === "g4" ? { ...tag, id } : tag,
        ),
      })[0];
    const result = rank("g4");
    expect(result.score).toBe(rank("g99").score);
    expect(result.reasons.slice(0, 2)).toEqual([
      "Matches Mystery and Drama",
      "Includes a theme you avoid: Gore",
    ]);
  });

  it("learns from ratings, favorites, and dropped titles", () => {
    const mystery = vn("v10", [{ id: "g1", name: "Mystery" }]);
    const gore = vn("v11", [{ id: "g3", name: "Gore" }]);
    const empty = {
      ...prefs,
      tagPreferences: [],
      preferredLengths: [],
      preferredPlatforms: [],
    };
    const ranked = rankRecommendations(
      [
        vn("v1", [{ id: "g1", name: "Mystery" }]),
        vn("v2", [{ id: "g3", name: "Gore" }]),
      ],
      [
        entry(mystery),
        entry(gore, {
          id: 2,
          vndbId: "v11",
          favorite: false,
          personalRating: 2,
          status: "dropped",
        }),
      ],
      empty,
    );
    expect(ranked[0].vn.id).toBe("v1");
    expect(ranked[0].reasons.join(" ")).toContain("favorites and ratings");
  });
  it("produces a useful spread without ceiling bunching", () => {
    const rich: Preferences = {
      tagPreferences: [
        { id: "g1", name: "Mystery", weight: 3 },
        { id: "g2", name: "Romance", weight: 1 },
        { id: "g3", name: "Gore", weight: -3 },
      ],
      preferredLengths: [3],
      preferredPlatforms: ["win"],
      useSpoilerTagsInRecommendations: false,
      completed: true,
    };
    const ranked = rankRecommendations(
      [
        vn(
          "v1",
          [
            { id: "g1", name: "Mystery" },
            { id: "g2", name: "Romance" },
          ],
          90,
          10000,
        ),
        vn("v2", [{ id: "g1", name: "Mystery" }], 75, 500),
        vn("v3", [{ id: "g4", name: "Comedy" }], 80, 1000),
        vn("v4", [{ id: "g3", name: "Gore" }], 85, 5000),
      ],
      [],
      rich,
    );
    const scores = ranked.map((x) => x.matchPercent);
    expect(Math.max(...scores)).toBeLessThan(95);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThanOrEqual(
      25,
    );
    expect(new Set(scores).size).toBe(4);
  });
  it("uses spoiler tags only when opted in and never names them in explanations", () => {
    const hidden = vn("v1", [{ id: "g1", name: "Mystery", spoiler: 2 }]);
    const plain = vn("v2", []);
    const safe = rankRecommendations([hidden, plain], [], prefs, false, 2);
    expect(safe.find((x) => x.vn.id === "v1")?.matchPercent).toBe(
      safe.find((x) => x.vn.id === "v2")?.matchPercent,
    );
    const privateResults = rankRecommendations(
      [hidden, plain],
      [],
      { ...prefs, useSpoilerTagsInRecommendations: true },
      false,
      2,
    );
    expect(
      privateResults.find((x) => x.vn.id === "v1")!.matchPercent,
    ).toBeGreaterThan(
      privateResults.find((x) => x.vn.id === "v2")!.matchPercent,
    );
    expect(
      privateResults.find((x) => x.vn.id === "v1")!.reasons.join(" "),
    ).not.toContain("Mystery");
  });

  it.each([
    [false, 63.672807641711955],
    [true, 66.63759930837863],
  ])(
    "preserves mixed-profile scores, reasons, and ties with spoilers=%s",
    (includeSpoilers, topScore) => {
      const candidates = [
        vn("v1", [
          { id: "g1", name: "Mystery", rating: 1.5 },
          { id: "g2", name: "Romance", rating: 1 },
          { id: "g4", name: "Hidden", spoiler: 2 },
        ]),
        vn("v2", [
          { id: "g1", name: "Mystery", rating: 0.75 },
          { id: "g3", name: "Gore", rating: 2 },
        ]),
        vn("v3", []),
        vn("v4", []),
        vn("v10", [{ id: "g1", name: "Mystery" }]),
      ];
      const library = [
        entry(
          vn("v10", [
            { id: "g1", name: "Mystery", rating: 2 },
            { id: "g2", name: "Romance", rating: 1 },
            { id: "g4", name: "Hidden", spoiler: 2 },
          ]),
        ),
        entry(vn("v11", [{ id: "g3", name: "Gore" }]), {
          id: 2,
          favorite: false,
          status: "dropped",
          personalRating: 2,
        }),
      ];
      const ranked = rankRecommendations(
        candidates,
        library,
        {
          ...prefs,
          tagPreferences: [
            { id: "g1", name: "Mystery", weight: 3 },
            { id: "g2", name: "Romance", weight: 1 },
            { id: "g3", name: "Gore", weight: -2 },
          ],
          useSpoilerTagsInRecommendations: includeSpoilers,
        },
        true,
        4,
      );
      expect(ranked.map((result) => result.vn.id)).toEqual([
        "v1",
        "v3",
        "v4",
        "v2",
      ]);
      expect(ranked.map((result) => result.score)).toEqual([
        topScore,
        54.02634930837862,
        54.02634930837862,
        41.51207847504529,
      ]);
      expect(ranked[0].reasons).toEqual([
        "Matches Mystery and Romance",
        "Echoes themes from your favorites and ratings: Mystery, Romance",
        "Fits your preferred reading length",
      ]);
      expect(ranked.at(-1)!.reasons).toEqual([
        "Matches Mystery",
        "Includes a theme you avoid: Gore",
        "Echoes themes from your favorites and ratings: Mystery",
      ]);
      expect(
        ranked.some((result) => result.reasons.join(" ").includes("Hidden")),
      ).toBe(false);
    },
  );
});
