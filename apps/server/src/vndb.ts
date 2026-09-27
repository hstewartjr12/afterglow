import type { VnDetail, VndbTag, VnSummary } from "@afterglow/shared";
import { sqlite } from "./db.js";
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
async function cachedFetch<T>(
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
    if (hit) return JSON.parse(String(hit.value)) as T;
    throw error;
  }
  await sqlite.execute({
    sql: "INSERT OR REPLACE INTO vn_cache(key,value,expires_at) VALUES(?,?,?)",
    args: [key, JSON.stringify(result), Date.now() + ttl],
  });
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
  return response.json();
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
// Detail and match requests often ask for the same VN concurrently.
// Share that work until the result is persisted in the existing disk cache.
const inFlight = new Map<string, Promise<VnPage<unknown>>>();
async function query(key: string, body: Raw): Promise<VnPage<VnSummary>>;
async function query(
  key: string,
  body: Raw,
  detail: true,
): Promise<VnPage<VnDetail>>;
async function query(key: string, body: Raw, detail = false) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = detail
    ? loadQuery(key, body, detailFields, mapDetail)
    : loadQuery(key, body, summaryFields, mapSummary);
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

export type VnSearchOptions = {
  q: string;
  page: number;
  platform?: string;
  length?: number;
  year?: number;
  rating?: number;
  sort?: "rating" | "released" | "votecount" | "title" | "searchrank";
};
export const searchVns = async (options: VnSearchOptions) => {
  const predicates: any[] = [];
  if (options.q) predicates.push(["search", "=", options.q]);
  if (options.platform) predicates.push(["platform", "=", options.platform]);
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
export const popularVns = () =>
  query("popular3", {
    filters: ["and", ["rating", ">=", 70], ["votecount", ">=", 100]],
    sort: "rating",
    reverse: true,
    results: 40,
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
  const key = `tags3:${category ?? "all"}:${q.toLowerCase()}:${page}`;
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
        description: (t.description ?? "")
          .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, "")
          .replace(/\[[^\]]+\]/g, ""),
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
) {
  if (!tagIds.length) return (await popularVns()).results;
  const spoilerLevel = includeSpoilers ? 2 : 0;
  const filters = [
    "or",
    ...tagIds.slice(0, 8).map((id) => ["tag", "=", [id, spoilerLevel, 0.5]]),
  ];
  const themed = await query(
    `personal3:${spoilerLevel}:${tagIds.slice(0, 8).sort().join(",")}`,
    { filters, sort: "rating", reverse: true, results: 60 },
  );
  const popular = await popularVns();
  return [
    ...new Map(
      [...themed.results, ...popular.results].map((v) => [v.id, v]),
    ).values(),
  ];
}
