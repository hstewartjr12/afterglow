import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => ({
  ...(await import("./databaseOperations.js")),
  sqlite: { execute: vi.fn(async () => ({ rows: [] })) },
}));
import { sqlite } from "./db.js";
import {
  fetchCover,
  getVn,
  isCoverUrl,
  personalizedVns,
  searchTags,
  searchVns,
} from "./vndb.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          results: Array.from({ length: body.results }, (_, index) => ({
            id: `v${(body.page - 1) * body.results + index + 1}`,
            title: `Story ${index + 1}`,
            rating: 80,
            platforms: ["win"],
            length: 2,
            released: "2024-01-01",
          })),
          count: 240,
          more: body.page < 8,
        }),
      };
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("catalogue pagination", () => {
  it("returns consecutive pages without losing titles or the upstream total", async () => {
    const first = await searchVns({ q: "", page: 1, sort: "rating" });
    const second = await searchVns({ q: "", page: 2, sort: "rating" });
    expect(first.results).toHaveLength(30);
    expect(first.results[29].id).toBe("v30");
    expect(second.results[0].id).toBe("v31");
    expect(second.count).toBe(240);
    expect(second.more).toBe(true);
    expect(sqlite.execute).toHaveBeenCalled();
  });

  it("keeps filtering and sorting in the upstream request", async () => {
    const result = await searchVns({
      q: "story",
      page: 2,
      sort: "title",
      platform: "win",
      length: 2,
      year: 2020,
      rating: 8,
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      page: 2,
      results: 30,
      sort: "title",
      reverse: false,
      count: true,
    });
    expect(body.filters).toEqual([
      "and",
      ["search", "=", "story"],
      ["platform", "=", "win"],
      ["length", "=", 2],
      ["released", ">=", "2020-01-01"],
      ["rating", ">=", 80],
    ]);
    expect(result.results).toHaveLength(30);
  });

  it("matches language and platform on the same release and only uses spoiler-free themes", async () => {
    await searchVns({
      q: "story",
      page: 3,
      language: "en",
      platform: "win",
      tag: "g42",
      sort: "title",
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      page: 3,
      sort: "title",
      reverse: false,
      count: true,
      results: 30,
    });
    expect(body.filters).toEqual([
      "and",
      ["search", "=", "story"],
      ["release", "=", ["and", ["lang", "=", "en"], ["platform", "=", "win"]]],
      ["tag", "=", ["g42", 0, 0.5]],
    ]);
  });

  it("supports language alone without imposing a platform", async () => {
    await searchVns({ q: "", page: 1, language: "ja" });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.filters).toEqual(["lang", "=", "ja"]);
    expect(body.count).toBe(true);
  });
});

describe("search ordering", () => {
  it("defaults to relevance while searching and rating while browsing", async () => {
    await searchVns({ q: "story", page: 1 });
    const searchBody = JSON.parse(
      vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string,
    );
    expect(searchBody.sort).toBe("searchrank");
    expect(searchBody.reverse).toBe(false);
    await searchVns({ q: "", page: 1 });
    const browseBody = JSON.parse(
      vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string,
    );
    expect(browseBody.sort).toBe("rating");
    expect(browseBody.reverse).toBe(true);
    await searchVns({ q: "", page: 1, sort: "searchrank" });
    const fallbackBody = JSON.parse(
      vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string,
    );
    expect(fallbackBody.sort).toBe("rating");
  });
});

describe("concurrent VN requests", () => {
  it("shares upstream work for the same title", async () => {
    await Promise.all([getVn("v1"), getVn("v1")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("allows retrying a failed shared request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);
    const results = await Promise.allSettled([getVn("v1"), getVn("v1")]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await getVn("v1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("concurrent tag requests", () => {
  it("shares work while skipping a page of unusable tags", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: "g1",
              name: "Mystery",
              category: "cont",
              searchable: true,
              applicable: body.page === 2,
              vn_count: 100,
            },
          ],
          count: 51,
          more: body.page === 1,
        }),
      } as Response;
    });
    const [first, second] = await Promise.all([
      searchTags("mystery", 1, "cont"),
      searchTags("mystery", 1, "cont"),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      page: 2,
      recordCount: 51,
      usableOnPage: 1,
      results: [{ id: "g1", name: "Mystery" }],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sqlite.execute).toHaveBeenCalledTimes(4);
  });

  it("allows retrying failed tag requests", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], count: 0, more: false }),
      } as Response);
    const results = await Promise.allSettled([
      searchTags("retry", 1),
      searchTags("retry", 1),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await searchTags("retry", 1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("personalized catalogue", () => {
  it("loads popular titles while themes are pending and preserves merge order", async () => {
    let finishThemed!: () => void;
    const themedPending = new Promise<void>((resolve) => {
      finishThemed = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      const themed = body.results === 60;
      if (themed) await themedPending;
      return {
        ok: true,
        json: async () => ({
          results: themed
            ? [
                { id: "v1", title: "Theme" },
                { id: "v2", title: "Shared theme" },
              ]
            : [
                { id: "v2", title: "Shared popular" },
                { id: "v3", title: "Popular" },
              ],
        }),
      } as Response;
    });
    const pending = personalizedVns(["g1"], true);
    try {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    } finally {
      finishThemed();
    }
    const result = await pending;
    expect(result.map((v) => [v.id, v.title])).toEqual([
      ["v1", "Theme"],
      ["v2", "Shared popular"],
      ["v3", "Popular"],
    ]);
    const themedBody = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]!.body as string,
    );
    expect(themedBody.filters).toEqual(["tag", "=", ["g1", 2, 0.5]]);
  });

  it("merges focused picks and applies exclusions across all sources", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      const ids = body.results === 16 ? ["v1", "v2", "v3"] : ["v1"];
      if (body.results === 16)
        expect(body.filters).toEqual(["tag", "=", ["g2", 0, 2.5]]);
      return Response.json({ results: ids.map((id) => ({ id, title: id })) });
    });
    const result = await personalizedVns(["g1", "g2"], false, ["v2"], "g2");
    expect(result.map((vn) => vn.id)).toEqual(["v1", "v3"]);
  });

  it("uses the surviving catalogue source when a first page fails", async () => {
    const page = () =>
      Response.json({ results: [{ id: "v1", title: "Available" }] });
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(page());
    expect((await personalizedVns(["g1"])).map((v) => v.id)).toEqual(["v1"]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new Error("Offline"));
    expect((await personalizedVns(["g2"])).map((v) => v.id)).toEqual(["v1"]);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Offline"));
    await expect(personalizedVns([])).rejects.toMatchObject({ upstream: true });
  });

  it("replenishes popular discoveries after owned or hidden titles exhaust the first page", async () => {
    const excluded = Array.from({ length: 40 }, (_, i) => `v${i + 1}`);
    const candidates = await personalizedVns([], false, excluded);
    expect(candidates).toHaveLength(40);
    expect(candidates[0].id).toBe("v41");
    expect(candidates.some((vn) => excluded.includes(vn.id))).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    const keys = vi
      .mocked(sqlite.execute)
      .mock.calls.map(([statement]) => (statement as any).args[0]);
    expect(keys).toContain("popular3");
    expect(keys).toContain("popular3:page2");
    expect(keys.every((key) => !String(key).includes("v1"))).toBe(true);
  });

  it("never walks past three pages when all candidates are excluded", async () => {
    const excluded = Array.from({ length: 200 }, (_, i) => `v${i + 1}`);
    expect(await personalizedVns([], false, excluded)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(
          ([, options]) => JSON.parse(options!.body as string).page,
        ),
    ).toEqual([1, 2, 3]);
  });

  it("preserves themed-first merge order across fallback pages and deduplicates overlaps", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      const themed = body.results === 60;
      return Response.json({
        results:
          body.page === 1
            ? [{ id: "v1", title: "Excluded" }]
            : themed
              ? [
                  { id: "v2", title: "Theme" },
                  { id: "v3", title: "Shared theme" },
                ]
              : [
                  { id: "v3", title: "Shared popular" },
                  { id: "v4", title: "Popular" },
                ],
        more: body.page === 1,
      });
    });
    const result = await personalizedVns(["g1", "g2"], false, ["v1"]);
    expect(result.map((vn) => [vn.id, vn.title])).toEqual([
      ["v2", "Theme"],
      ["v3", "Shared popular"],
      ["v4", "Popular"],
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).filters,
    ).toEqual([
      "or",
      ["tag", "=", ["g1", 0, 0.5]],
      ["tag", "=", ["g2", 0, 0.5]],
    ]);
  });

  it("retains usable first-page discoveries if an optional fallback page fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ results: [{ id: "v1", title: "Keep" }], more: true }),
      )
      .mockRejectedValueOnce(new TypeError("Offline"));
    const result = await personalizedVns([]);
    expect(result.map((vn) => vn.id)).toEqual(["v1"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("upstream outages", () => {
  it("serves expired cached data when VNDB cannot be reached", async () => {
    const stale = { results: [{ id: "v7", title: "Cached" }] };
    vi.mocked(sqlite.execute).mockResolvedValueOnce({
      rows: [{ value: JSON.stringify(stale), expires_at: Date.now() - 1000 }],
    } as any);
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await getVn("v7")).toEqual(stale.results[0]);
  });

  it("reports network failures as upstream errors", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(getVn("v8")).rejects.toMatchObject({
      upstream: true,
      message: "VNDB could not be reached.",
    });
  });
});

describe("requested fields", () => {
  const fieldsOf = () =>
    String(
      JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string).fields,
    ).split(",");

  it("leaves descriptions out of list results", async () => {
    const result = await searchVns({ q: "", page: 3 });
    expect(fieldsOf()).not.toContain("description");
    expect(result.results[0]).not.toHaveProperty("description");
  });

  it("includes descriptions and aliases for a single title", async () => {
    await getVn("v42");
    expect(fieldsOf()).toEqual(
      expect.arrayContaining(["description", "aliases"]),
    );
  });
});

describe("cover proxy", () => {
  it("only accepts https URLs on VNDB's own hosts", () => {
    expect(isCoverUrl("https://t.vndb.org/cv/12/34512.jpg")).toBe(true);
    expect(isCoverUrl("https://vndb.org/cv/1.jpg")).toBe(true);
    expect(isCoverUrl("http://t.vndb.org/cv/1.jpg")).toBe(false);
    expect(isCoverUrl("https://t.vndb.org.evil.test/cv/1.jpg")).toBe(false);
    expect(isCoverUrl("https://localhost:3001/api/library")).toBe(false);
    expect(isCoverUrl("not a url")).toBe(false);
  });

  it("passes images through and rejects anything else", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const cover = await fetchCover("https://t.vndb.org/cv/1.jpg");
    expect(vi.mocked(fetch).mock.calls[0][1]?.redirect).toBe("error");
    expect(cover.type).toBe("image/jpeg");
    expect([...cover.body]).toEqual([1, 2, 3]);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    await expect(
      fetchCover("https://t.vndb.org/cv/2.jpg"),
    ).rejects.toMatchObject({
      upstream: true,
    });
  });
});
