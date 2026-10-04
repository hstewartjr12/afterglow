import { describe, expect, it, vi } from "vitest";
import worker from "./index";
const env = {
  ASSETS: {
    fetch: vi.fn(
      async () =>
        new Response("app", { headers: { "Content-Type": "text/html" } }),
    ),
  },
};
const request = (path: string, method = "GET") =>
  worker.fetch(new Request("https://example.test" + path, { method }), env);
describe("public catalogue server", () => {
  it("serves assets and never exposes a personal-data API", async () => {
    const html = await request("/");
    expect(await html.text()).toBe("app");
    expect(html.headers.get("Cache-Control")).toBe("no-cache");
    for (const path of [
      "/api/library",
      "/api/preferences",
      "/api/recommendations",
    ])
      expect((await request(path)).status).toBe(404);
    expect((await request("/api/library/v17", "PUT")).status).toBe(405);
    expect((await request("/api/vndb/search", "POST")).status).toBe(405);
  });
  it("rejects invalid catalogue filters and external cover hosts before making upstream requests", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    for (const path of [
      "/api/vndb/search?page=0",
      "/api/vndb/search?platform=bad",
      "/api/vndb/search?language=bad",
      "/api/vndb/search?tag=nope",
      "/api/vndb/candidates?page=4",
      "/api/vndb/candidates?tags=g1,g2,g3,g4,g5,g6,g7,g8,g9",
      "/api/vndb/candidates?tags=bad",
      "/api/vndb/vn/nope",
      "/api/cover?url=https://example.test/private",
    ])
      expect((await request(path)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("maps live catalogue responses and caches repeated queries", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        results: [{ id: "v17", title: "Ever17", tags: [], platforms: ["win"] }],
        count: 1,
        more: false,
      }),
    );
    const first = await request("/api/vndb/search?q=worker-test");
    expect(first.status).toBe(200);
    expect((await first.json()).results[0].title).toBe("Ever17");
    expect((await request("/api/vndb/search?q=worker-test")).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const body = JSON.parse(upstream.mock.calls[0][1]?.body as string);
    expect(body.filters).toEqual(["search", "=", "worker-test"]);
  });
  it("keeps concurrent visitors independent if the first upstream request fails", async () => {
    let rejectFirst!: (error: Error) => void;
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(
        Response.json({ results: [{ id: "v17", title: "Ever17", tags: [] }] }),
      );
    const first = request("/api/vndb/search?q=independent-visitors");
    const second = request("/api/vndb/search?q=independent-visitors");
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
    expect((await second).status).toBe(200);
    rejectFirst(new Error("Originating request canceled"));
    expect((await first).status).toBe(502);
  });
  it("loads themed and popular candidates together while preserving merge order", async () => {
    const complete: (() => void)[] = [];
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, options) => {
        const themed = JSON.parse(options?.body as string).results === 60;
        return new Promise<Response>((resolve) => {
          complete.push(() =>
            resolve(
              Response.json({
                results: themed
                  ? [
                      { id: "v201", title: "Themed", tags: [] },
                      { id: "v202", title: "Shared themed", tags: [] },
                    ]
                  : [
                      { id: "v202", title: "Shared popular", tags: [] },
                      { id: "v203", title: "Popular", tags: [] },
                    ],
              }),
            ),
          );
        });
      });
    const candidates = request("/api/vndb/candidates?tags=g220223");
    try {
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
    } finally {
      complete.forEach((resolve) => resolve());
    }
    const response = await candidates;
    expect(response.status).toBe(200);
    expect(
      (await response.json()).map((vn: { title: string }) => vn.title),
    ).toEqual(["Themed", "Shared popular", "Popular"]);
  });
  it("requires language and platform on the same release and keeps theme filters spoiler-free", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ results: [], count: 0, more: false }));
    expect(
      (await request("/api/vndb/search?language=en&platform=swi&tag=g981273"))
        .status,
    ).toBe(200);
    const body = JSON.parse(upstream.mock.calls[0][1]?.body as string);
    expect(body.filters).toEqual([
      "and",
      ["release", "=", ["and", ["lang", "=", "en"], ["platform", "=", "swi"]]],
      ["tag", "=", ["g981273", 0, 0.5]],
    ]);
  });
  it("returns cumulative bounded candidate pages and retains good pages if an expansion fails", async () => {
    vi.resetModules();
    const isolated = (await import("./index")).default;
    const calls: { page: number; results: number }[] = [];
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, options) => {
        const body = JSON.parse(options?.body as string);
        calls.push(body);
        if (body.results === 60 && body.page === 2)
          throw new Error("Optional page unavailable");
        return Response.json({
          results: [
            {
              id: `v${body.results}${body.page}`,
              title: `Page ${body.page}`,
              tags: [],
            },
          ],
          more: body.page < 3,
        });
      });
    const response = await isolated.fetch(
      new Request(
        "https://example.test/api/vndb/candidates?tags=g981274&page=3",
      ),
      env,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).map((vn: { id: string }) => vn.id)).toEqual([
      "v601",
      "v401",
      "v402",
      "v403",
    ]);
    expect(calls.map(({ page, results }) => [results, page])).toEqual([
      [60, 1],
      [40, 1],
      [60, 2],
      [40, 2],
      [40, 3],
    ]);
    expect(upstream).toHaveBeenCalledTimes(5);
  });
  it("reports upstream rate limiting clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("busy", { status: 429 }),
    );
    const response = await request("/api/vndb/search?q=rate-limit-test");
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch("VNDB is busy");
  });
});
