import type { VnDetail } from "@afterglow/shared";
import { sqlite } from "./db.js";
const BASE = "https://api.vndb.org/kana";
const HALF_HOUR = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const vnFields =
  "title,alttitle,aliases,released,rating,votecount,length_minutes,length,platforms,description,image.url,image.sexual,image.violence,tags.id,tags.name,tags.rating,tags.spoiler";
type Raw = Record<string, any>;
function map(raw: Raw): VnDetail {
  return {
    id: raw.id,
    title: raw.title,
    alttitle: raw.alttitle ?? null,
    aliases: raw.aliases ?? [],
    description: raw.description ?? null,
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
    | { value: string; expires_at: number }
    | undefined;
  if (hit && Number(hit.expires_at) > Date.now())
    return JSON.parse(String(hit.value)) as T;
  const result = await request();
  await sqlite.execute({
    sql: "INSERT OR REPLACE INTO vn_cache(key,value,expires_at) VALUES(?,?,?)",
    args: [key, JSON.stringify(result), Date.now() + ttl],
  });
  return result;
}
async function post(path: string, body: Raw, fallback: string): Promise<any> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Afterglow/0.2 personal VN tracker",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = new Error(
      response.status === 429
        ? "VNDB is busy. Please try again shortly."
        : fallback,
    );
    (err as any).status = response.status;
    throw err;
  }
  return response.json();
}
async function loadQuery(
  key: string,
  body: Raw,
): Promise<{ results: VnDetail[]; more?: boolean; count?: number }> {
  return cachedFetch(key, HALF_HOUR, async () => {
    const raw = await post(
      "/vn",
      { ...body, fields: vnFields },
      "VNDB could not be reached.",
    );
    return { ...raw, results: raw.results.map(map) };
  });
}
// Detail and match requests often ask for the same VN concurrently.
// Share that work until the result is persisted in the existing disk cache.
const inFlight = new Map<string, ReturnType<typeof loadQuery>>();
async function query(key: string, body: Raw) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = loadQuery(key, body);
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
  const key = `browse4:${JSON.stringify({ ...options, q: options.q.toLowerCase() })}`;
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
    (await query(`vn2:${id}`, { filters: ["id", "=", id], results: 1 }))
      .results[0] ?? null
  );
}
export const popularVns = () =>
  query("popular2", {
    filters: ["and", ["rating", ">=", 70], ["votecount", ">=", 100]],
    sort: "rating",
    reverse: true,
    results: 40,
  });
export async function searchTags(
  q: string,
  page: number,
  category?: "cont" | "ero" | "tech",
) {
  const key = `tags3:${category ?? "all"}:${q.toLowerCase()}:${page}`;
  const result = await cachedFetch(key, DAY, async () => {
    const predicates: any[] = [];
    if (q) predicates.push(["search", "=", q]);
    if (category) predicates.push(["category", "=", category]);
    const body: any = {
      fields: "name,aliases,description,category,searchable,applicable,vn_count",
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
        description: (t.description ?? "").replace(/\[[^\]]+\]/g, ""),
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
  if (!result.results.length && result.more) return searchTags(q, page + 1, category);
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
    `personal2:${spoilerLevel}:${tagIds.slice(0, 8).sort().join(",")}`,
    { filters, sort: "rating", reverse: true, results: 60 },
  );
  const popular = await popularVns();
  return [
    ...new Map(
      [...themed.results, ...popular.results].map((v) => [v.id, v]),
    ).values(),
  ];
}
