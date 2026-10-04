import { requestJson } from "./lib/request";
import type {
  Backup,
  BackupImportInput,
  BackupImportResult,
  RecommendationFeedback,
  LibraryEntry,
  LibraryInput,
  Preferences,
  Recommendation,
  VnDetail,
  VndbTag,
  VnSummary,
} from "@afterglow/shared";
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
const request = <T>(url: string, options?: RequestInit) =>
  requestJson<T>(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

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
    return request<{
      results: VnSummary[];
      count?: number;
      more?: boolean;
    }>(`/api/vndb/search?${params}`, { signal });
  },
  tags: (q: string, page = 1, category = "", signal?: AbortSignal) =>
    request<{
      results: VndbTag[];
      recordCount: number;
      usableOnPage: number;
      page: number;
      more: boolean;
    }>(
      `/api/vndb/tags?q=${encodeURIComponent(q)}&page=${page}${category ? `&category=${category}` : ""}`,
      { signal },
    ),
  detail: (id: string, signal?: AbortSignal) =>
    request<VnDetail>(`/api/vndb/vn/${id}`, { signal }),
  library: () => request<LibraryEntry[]>("/api/library"),
  saveLibrary: (id: string, input: LibraryInput) =>
    request<LibraryEntry>(`/api/library/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  quickWishlist: (vn: VnSummary) =>
    request<{ entry: LibraryEntry; created: boolean }>(
      `/api/library/${vn.id}/wishlist`,
      {
        method: "PUT",
        body: JSON.stringify({ vn }),
      },
    ),
  feedback: () => request<RecommendationFeedback[]>("/api/feedback"),
  saveFeedback: (vn: VnSummary, until: string | null) =>
    request<RecommendationFeedback>(`/api/feedback/${vn.id}`, {
      method: "PUT",
      body: JSON.stringify({ vn, until }),
    }),
  removeFeedback: (id: string) =>
    request<void>(`/api/feedback/${id}`, { method: "DELETE" }),
  backup: () => request<Backup>("/api/backup"),
  importBackup: (input: BackupImportInput) =>
    request<BackupImportResult>("/api/backup/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removeLibrary: (id: string) =>
    request<void>(`/api/library/${id}`, { method: "DELETE" }),
  preferences: () => request<Preferences>("/api/preferences"),
  savePreferences: (p: Preferences) =>
    request<Preferences>("/api/preferences", {
      method: "PUT",
      body: JSON.stringify(p),
    }),
  recommendations: () => request<Recommendation[]>("/api/recommendations"),
  scoreCandidates: (vns: VnSummary[], signal?: AbortSignal) =>
    request<Recommendation[]>("/api/recommendations/score", {
      method: "POST",
      body: JSON.stringify({ vns }),
      signal,
    }),
  recommendation: (id: string, signal?: AbortSignal) =>
    request<Recommendation>(`/api/recommendations/${id}`, { signal }),
};
