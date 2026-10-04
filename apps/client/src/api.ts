import { requestJson } from "./lib/request";
import type { VnDetail, VndbTag, VnSummary } from "@afterglow/shared";
import { recommendationTagIds } from "@afterglow/shared/candidates";
import { rankRecommendations } from "@afterglow/shared/recommend";
import { storage } from "./demo/storage";
export type VnSearchFilters = {
  q: string;
  platform: string;
  language?: string;
  tag?: string;
  length: string;
  year: string;
  rating: string;
  sort?: string;
  page?: number;
};
const request = <T>(url: string, signal?: AbortSignal) =>
  requestJson<T>(url, { signal });

export const api = {
  search: (filters: VnSearchFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      q: filters.q,
      page: String(filters.page ?? 1),
    });
    if (filters.sort) params.set("sort", filters.sort);
    for (const key of [
      "platform",
      "language",
      "tag",
      "length",
      "year",
      "rating",
    ] as const)
      if (filters[key]) params.set(key, filters[key]);
    return request<{ results: VnSummary[]; count?: number; more?: boolean }>(
      `/api/vndb/search?${params}`,
      signal,
    );
  },
  tags: (q: string, page = 1, category = "", signal?: AbortSignal) =>
    request<{
      results: VndbTag[];
      recordCount: number;
      usableOnPage: number;
      page: number;
      more?: boolean;
    }>(
      `/api/vndb/tags?q=${encodeURIComponent(q)}&page=${page}${category ? `&category=${category}` : ""}`,
      signal,
    ),
  detail: (id: string, signal?: AbortSignal) =>
    request<VnDetail>(`/api/vndb/vn/${id}`, signal),
  library: storage.library,
  saveLibrary: storage.saveLibrary,
  quickWishlist: storage.quickWishlist,
  feedback: storage.feedback,
  saveFeedback: storage.saveFeedback,
  removeFeedback: storage.removeFeedback,
  backup: storage.backup,
  importBackup: storage.importBackup,
  removeLibrary: storage.removeLibrary,
  preferences: storage.preferences,
  savePreferences: storage.savePreferences,
  recommendations: async () => {
    const [library, prefs, feedback] = await Promise.all([
      storage.library(),
      storage.preferences(),
      storage.feedback().catch(() => []),
    ]);
    const tags = recommendationTagIds(library, prefs);
    const excluded = new Set([
      ...library.map((entry) => entry.vndbId),
      ...feedback.map((entry) => entry.vndbId),
    ]);
    let candidates: VnSummary[] = [];
    for (let page = 1; page <= 3; page++) {
      const params = new URLSearchParams({
        tags: tags.join(","),
        spoilers: prefs.useSpoilerTagsInRecommendations ? "1" : "0",
        page: String(page),
      });
      let pool: VnSummary[];
      try {
        pool = await request<VnSummary[]>(`/api/vndb/candidates?${params}`);
      } catch (error) {
        if (page === 1) throw error;
        break;
      }
      const eligible = pool.filter((vn) => !excluded.has(vn.id));
      candidates = eligible;
      if (candidates.length >= 24) break;
    }
    return rankRecommendations(candidates, library, prefs, true, 24);
  },
  scoreCandidates: async (vns: VnSummary[], signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const [library, prefs] = await Promise.all([
      storage.library(),
      storage.preferences(),
    ]);
    signal?.throwIfAborted();
    return rankRecommendations(vns, library, prefs, false, vns.length);
  },
  recommendation: async (id: string, signal?: AbortSignal) => {
    const [vn, library, prefs] = await Promise.all([
      request<VnDetail>(`/api/vndb/vn/${id}`, signal),
      storage.library(),
      storage.preferences(),
    ]);
    return rankRecommendations([vn], library, prefs, false)[0];
  },
};
