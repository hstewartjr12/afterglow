import { requestJson } from "./lib/request";
import type { VnDetail, VndbTag, VnSummary } from "@afterglow/shared";
import { rankRecommendations } from "@afterglow/shared/recommend";
import { storage } from "./demo/storage";
export type VnSearchFilters = {
  q: string;
  platform: string;
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
    for (const key of ["platform", "length", "year", "rating"] as const)
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
  removeLibrary: storage.removeLibrary,
  preferences: storage.preferences,
  savePreferences: storage.savePreferences,
  recommendations: async () => {
    const [library, prefs] = await Promise.all([
      storage.library(),
      storage.preferences(),
    ]);
    const tags = prefs.tagPreferences
      .filter((p) => p.weight > 0 && /^g\d+$/.test(p.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((p) => p.id);
    const params = new URLSearchParams({
      tags: tags.join(","),
      spoilers: prefs.useSpoilerTagsInRecommendations ? "1" : "0",
    });
    const candidates = await request<VnSummary[]>(
      `/api/vndb/candidates?${params}`,
    );
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
