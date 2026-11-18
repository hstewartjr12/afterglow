import { splitSpoilers } from "@afterglow/shared/spoilers";
import type { VnDetail, VndbTag, VnSummary } from "@afterglow/shared";
import { serializeDatabaseOperation, sqlite } from "./db.js";
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
// Share catalogue and tag work until it has been persisted in the disk cache.
const inFlight = new Map<string, Promise<unknown>>();
async function cachedFetch<T>(
  key: string,
  ttl: number,
  request: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = loadCached(key, ttl, request);
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}
async function loadCached<T>(
  key: string,
  ttl: number,
  request: () => Promise<T>,
): Promise<T> {
  const cached = await sqlite.execute({
    sql: "SELECT value, expires_at FROM vn_cache WHERE key=?",
    args: [key],
  });
  const hit = cached.rows[0] as unknown as
    { value: string; expires_at: number } | undefined;
  if (hit && Number(hit.expires_at) > Date.now())
    return JSON.parse(String(hit.value)) as T;
  let result: T;
  try {
    result = await request();
  } catch (error) {
    // Prefer slightly old catalogue data over an error page while VNDB is unavailable.
    if (hit && Number(hit.expires_at) >= Date.now() - 7 * DAY)
      return JSON.parse(String(hit.value)) as T;
    throw error;
  }
  await serializeDatabaseOperation(() =>
    sqlite.execute({
      sql: "INSERT OR REPLACE INTO vn_cache(key,value,expires_at) VALUES(?,?,?)",
      args: [key, JSON.stringify(result), Date.now() + ttl],
    }),
  );
  return result;
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
        "User-Agent": "Afterglow/0.1 personal VN tracker",
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
async function query(key: string, body: Raw): Promise<VnPage<VnSummary>>;
async function query(
  key: string,
  body: Raw,
  detail: true,
): Promise<VnPage<VnDetail>>;
async function query(key: string, body: Raw, detail = false) {
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
  excludedIds: Iterable<string> = [],
  focus?: string,
) {
  const excluded = new Set(excludedIds);
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
  const [themeResult, popularResult, focusedResult] = await Promise.allSettled([
    seeds.length ? themedPage(1) : Promise.resolve(emptyPage),
    popularVns(),
    focus && !(seeds.length === 1 && seeds[0] === focus)
      ? query(`focus1:${spoilerLevel}:${focus}`, {
          filters: ["tag", "=", [focus, spoilerLevel, 2.5]],
          sort: "rating",
          reverse: true,
          results: 16,
          page: 1,
        })
      : Promise.resolve(emptyPage),
  ]);
  if (
    popularResult.status === "rejected" &&
    (!seeds.length || themeResult.status === "rejected") &&
    !(
      focusedResult.status === "fulfilled" && focusedResult.value.results.length
    )
  )
    throw popularResult.reason;
  let themed =
    themeResult.status === "fulfilled" ? themeResult.value : emptyPage;
  let popular =
    popularResult.status === "fulfilled" ? popularResult.value : emptyPage;
  const themedResults = [...themed.results];
  const focused =
    focusedResult.status === "fulfilled" ? focusedResult.value.results : [];
  const popularResults = [...popular.results];
  const merge = () =>
    [
      ...new Map(
        [...themedResults, ...popularResults, ...focused].map((vn) => [
          vn.id,
          vn,
        ]),
      ).values(),
    ].filter((vn) => !excluded.has(vn.id));
  let candidates = merge();
  // Fetch at most three pages per source, and only when exclusions leave too
  // few discoveries. Cache keys remain public and independent of personal IDs.
  for (
    let page = 2;
    page <= 3 && candidates.length < 24 && (themed.more || popular.more);
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
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      headers: { "User-Agent": "Afterglow/0.1 personal VN tracker" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UpstreamError("The cover could not be loaded.");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/"))
    throw new UpstreamError("The cover could not be loaded.", response.status);
  try {
    return { type, body: Buffer.from(await response.arrayBuffer()) };
  } catch {
    throw new UpstreamError("The cover could not be loaded.");
  }
}
