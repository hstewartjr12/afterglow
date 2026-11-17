import { splitSpoilers } from "@afterglow/shared/spoilers";
import type { VnDetail, VndbTag, VnSummary } from "@afterglow/shared";

const BASE = "https://api.vndb.org/kana";
const HALF_HOUR = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
// Lists only need what cards and scoring use; descriptions are fetched with the detail view.
const summaryFields =
  "title,alttitle,released,rating,votecount,length,platforms,image.url,image.sexual,image.violence,tags.id,tags.name,tags.rating,tags.spoiler";
const detailFields = `${summaryFields},aliases,description`;
type Raw = Record<string, any>;
function mapSummary(raw: Raw): VnSummary {
  return {
    id: raw.id,
    title: raw.title,
    alttitle: raw.alttitle ?? null,
    imageUrl: raw.image?.url ?? null,
    imageSexual: raw.image?.sexual ?? 0,
    imageViolence: raw.image?.violence ?? 0,
    released: raw.released ?? null,
    rating: raw.rating ?? null,
    voteCount: raw.votecount ?? 0,
    length: raw.length ?? null,
    platforms: raw.platforms ?? [],
    tags: (raw.tags ?? []).map((t: Raw) => ({
      id: t.id,
      name: t.name,
      rating: t.rating ?? 0,
      spoiler: t.spoiler ?? 0,
    })),
  };
}
function mapDetail(raw: Raw): VnDetail {
  return {
    ...mapSummary(raw),
    aliases: raw.aliases ?? [],
    description: raw.description ?? null,
  };
}
type VnPage<T> = { results: T[]; more?: boolean; count?: number };

// Catalogue responses are shared; personal libraries and notes never enter this cache.
const memoryCache = new Map<string, { expires: number; value: unknown }>();
const edgeCache = () =>
  (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
async function cachedFetch<T>(
  key: string,
  ttl: number,
  request: () => Promise<T>,
): Promise<T> {
  const edge = edgeCache();
  const cacheRequest = new Request(
    `https://afterglow-cache.invalid/catalogue/${encodeURIComponent(key)}`,
  );
  if (edge) {
    const hit = await edge.match(cacheRequest).catch(() => undefined);
    if (hit) return hit.json() as Promise<T>;
  } else {
    const hit = memoryCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
  }
  const value = await request();
  if (edge) {
    await edge
      .put(
        cacheRequest,
        new Response(JSON.stringify(value), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${Math.floor(ttl / 1000)}`,
          },
        }),
      )
      .catch(() => {});
  } else {
    if (memoryCache.size >= 100)
      memoryCache.delete(memoryCache.keys().next().value!);
    memoryCache.set(key, { expires: Date.now() + ttl, value });
  }
  return value;
}
class UpstreamError extends Error {
  readonly upstream = true;
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
async function post(path: string, body: Raw, fallback: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Afterglow/0.1 browser demo (github.com/hstewartjr12/afterglow)",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UpstreamError(fallback);
  }
  if (!response.ok)
    throw new UpstreamError(
      response.status === 429
        ? "VNDB is busy. Please try again shortly."
        : fallback,
      response.status,
    );
  try {
    return await response.json();
  } catch {
    throw new UpstreamError(fallback);
  }
}
async function loadQuery<T>(
  key: string,
  body: Raw,
  fields: string,
  mapResult: (raw: Raw) => T,
): Promise<VnPage<T>> {
  return cachedFetch(key, HALF_HOUR, async () => {
    const raw = await post(
      "/vn",
      { ...body, fields },
      "VNDB could not be reached.",
    );
    return { ...raw, results: raw.results.map(mapResult) };
  });
}
// Only completed catalogue data may be shared across Worker invocations.
// An in-flight promise belongs to its originating request and can be abandoned
// when that client disconnects, leaving other clients waiting indefinitely.
function query(key: string, body: Raw): Promise<VnPage<VnSummary>>;
function query(key: string, body: Raw, detail: true): Promise<VnPage<VnDetail>>;
function query(key: string, body: Raw, detail = false) {
  return detail
    ? loadQuery(key, body, detailFields, mapDetail)
    : loadQuery(key, body, summaryFields, mapSummary);
}

export type VnSearchOptions = {
  q: string;
  page: number;
  platform?: string;
  language?: string;
  tag?: string;
  length?: number;
  year?: number;
  rating?: number;
  sort?: "rating" | "released" | "votecount" | "title" | "searchrank";
};
export const searchVns = async (options: VnSearchOptions) => {
  const predicates: any[] = [];
  if (options.q) predicates.push(["search", "=", options.q]);
  if (options.language && options.platform) {
    // Both requirements must hold for the same release, not two editions of a VN.
    predicates.push([
      "release",
      "=",
      [
        "and",
        ["lang", "=", options.language],
        ["platform", "=", options.platform],
      ],
    ]);
  } else {
    if (options.language) predicates.push(["lang", "=", options.language]);
    if (options.platform) predicates.push(["platform", "=", options.platform]);
  }
  if (options.tag) predicates.push(["tag", "=", [options.tag, 0, 0.5]]);
  if (options.length) predicates.push(["length", "=", options.length]);
  if (options.year)
    predicates.push(["released", ">=", `${options.year}-01-01`]);
  if (options.rating) predicates.push(["rating", ">=", options.rating * 10]);
  const filters =
    predicates.length === 0
      ? []
      : predicates.length === 1
        ? predicates[0]
        : ["and", ...predicates];
  const sort =
    !options.q && options.sort === "searchrank"
      ? "rating"
      : (options.sort ?? (options.q ? "searchrank" : "rating"));
  const key = `browse5:${JSON.stringify({ ...options, q: options.q.toLowerCase() })}`;
  return query(key, {
    filters,
    sort,
    reverse: sort !== "title" && sort !== "searchrank",
    results: 30,
    page: options.page,
    count: true,
  });
};
export async function getVn(id: string) {
  return (
    (await query(`vn2:${id}`, { filters: ["id", "=", id], results: 1 }, true))
      .results[0] ?? null
  );
}
export const popularVns = (page = 1) =>
  query(page === 1 ? "popular3" : `popular3:page${page}`, {
    filters: ["and", ["rating", ">=", 70], ["votecount", ">=", 100]],
    sort: "rating",
    reverse: true,
    results: 40,
    page,
  });
export async function searchTags(
  q: string,
  page: number,
  category?: "cont" | "ero" | "tech",
  skipped = 0,
): Promise<{
  recordCount: number;
  usableOnPage: number;
  page: number;
  more: boolean;
  results: VndbTag[];
}> {
  const key = `tags4:${category ?? "all"}:${q.toLowerCase()}:${page}`;
  const result = await cachedFetch(key, DAY, async () => {
    const predicates: any[] = [];
    if (q) predicates.push(["search", "=", q]);
    if (category) predicates.push(["category", "=", category]);
    const body: any = {
      fields:
        "name,aliases,description,category,searchable,applicable,vn_count",
      results: 50,
      page,
      sort: q ? "searchrank" : "vn_count",
      reverse: !q,
      count: true,
    };
    if (predicates.length)
      body.filters =
        predicates.length === 1 ? predicates[0] : ["and", ...predicates];
    const raw = await post(
      "/tag",
      body,
      "The VNDB tag index could not be reached.",
    );
    const usable = raw.results
      .filter((t: Raw) => t.searchable && t.applicable)
      .map((t: Raw) => ({
        id: t.id,
        name: t.name,
        aliases: t.aliases ?? [],
        description: splitSpoilers(t.description ?? "")
          .filter((part) => !part.spoiler)
          .map((part) => part.text.replace(/\[[^\]]+\]/g, ""))
          .join(""),
        category: t.category,
        searchable: t.searchable,
        applicable: t.applicable,
        vnCount: t.vn_count ?? 0,
      }));
    return {
      recordCount: raw.count,
      usableOnPage: usable.length,
      page,
      more: raw.more,
      results: usable,
    };
  });
  // Skip pages made up entirely of unusable tags, but never walk the whole index.
  if (!result.results.length && result.more && skipped < 5)
    return searchTags(q, page + 1, category, skipped + 1);
  return result;
}
export async function personalizedVns(
  tagIds: string[],
  includeSpoilers = false,
  maxPage = 1,
) {
  const seeds = [...new Set(tagIds)].slice(0, 8);
  const spoilerLevel = includeSpoilers ? 2 : 0;
  const predicates = seeds.map((id) => ["tag", "=", [id, spoilerLevel, 0.5]]);
  const filters =
    predicates.length === 1 ? predicates[0] : ["or", ...predicates];
  const baseKey = `personal3:${spoilerLevel}:${[...seeds].sort().join(",")}`;
  const themedPage = (page: number) =>
    query(page === 1 ? baseKey : `${baseKey}:page${page}`, {
      filters,
      sort: "rating",
      reverse: true,
      results: 60,
      page,
    });
  const emptyPage: VnPage<VnSummary> = { results: [], more: false };
  const [themeResult, popularResult] = await Promise.allSettled([
    seeds.length ? themedPage(1) : Promise.resolve(emptyPage),
    popularVns(),
  ]);
  if (
    popularResult.status === "rejected" &&
    (!seeds.length || themeResult.status === "rejected")
  )
    throw popularResult.reason;
  let themed =
    themeResult.status === "fulfilled" ? themeResult.value : emptyPage;
  let popular =
    popularResult.status === "fulfilled" ? popularResult.value : emptyPage;
  const themedResults = [...themed.results];
  const popularResults = [...popular.results];
  const merge = () => [
    ...new Map(
      [...themedResults, ...popularResults].map((vn) => [vn.id, vn]),
    ).values(),
  ];
  let candidates = merge();
  // The browser asks for another bounded public page only when its local
  // exclusions leave too few picks. No personal library or hidden IDs are sent.
  for (
    let page = 2;
    page <= Math.min(3, maxPage) && (themed.more || popular.more);
    page++
  ) {
    const [nextThemed, nextPopular] = await Promise.all([
      themed.more ? themedPage(page).catch(() => null) : null,
      popular.more ? popularVns(page).catch(() => null) : null,
    ]);
    themed = nextThemed ?? { results: [], more: false };
    popular = nextPopular ?? { results: [], more: false };
    themedResults.push(...themed.results);
    popularResults.push(...popular.results);
    candidates = merge();
  }
  return candidates;
}

/** Only VNDB's own image hosts may be fetched through the cover proxy. */
export function isCoverUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "vndb.org" || url.hostname.endsWith(".vndb.org"))
    );
  } catch {
    return false;
  }
}

/**
 * Fetches a cover image so the client can serve it from its own origin, which
 * lets the browser read its colors for tinting the interface.
 */
export async function fetchCover(url: string) {
  // Covers never change at a URL, so every visitor after the first is served
  // from the edge instead of waiting on VNDB.
  const edge = edgeCache();
  const cacheRequest = new Request(
    `https://afterglow-cache.invalid/cover/${encodeURIComponent(url)}`,
  );
  const hit = await edge?.match(cacheRequest).catch(() => undefined);
  if (hit)
    return {
      type: hit.headers.get("content-type") ?? "image/jpeg",
      body: await hit.arrayBuffer(),
    };
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual", // Keep upstream redirects from leaving the VNDB allowlist.
      headers: {
        "User-Agent":
          "Afterglow/0.1 browser demo (github.com/hstewartjr12/afterglow)",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UpstreamError("The cover could not be loaded.");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/"))
    throw new UpstreamError("The cover could not be loaded.", response.status);
  const body = await response.arrayBuffer().catch(() => {
    throw new UpstreamError("The cover could not be loaded.");
  });
  await edge
    ?.put(
      cacheRequest,
      new Response(body, {
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, max-age=604800",
        },
      }),
    )
    .catch(() => {});
  return { type, body };
}
