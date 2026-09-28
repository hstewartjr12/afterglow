import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { VnSummary } from "@afterglow/shared";
import { api } from "../api";
import { lengths, platformLabels, releaseYears } from "../lib/format";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/status";
const PAGE_SIZE = 30;

export function Discover({
  open,
  initialTerm,
}: {
  open: (v: VnSummary) => void;
  initialTerm: string;
}) {
  const [term, setTerm] = useState(initialTerm);
  const [filters, setFilters] = useState({
    q: initialTerm,
    platform: "",
    length: "",
    year: "",
    rating: "",
    sort: "searchrank",
    page: 1,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultHeading = useRef<HTMLDivElement>(null);
  const changePage = (page: number) => {
    setFilters((previous) => ({ ...previous, page }));
    resultHeading.current?.scrollIntoView?.({ block: "start" });
  };
  const update = (
    key: "platform" | "length" | "year" | "rating" | "sort",
    value: string,
  ) => setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((previous) =>
          previous.q === term.trim()
            ? previous
            : { ...previous, q: term.trim(), page: 1 },
        ),
      350,
    );
    return () => clearTimeout(timer);
  }, [term]);
  const effectiveSort =
    filters.sort === "searchrank" && !filters.q ? "rating" : filters.sort;
  const request = { ...filters, sort: effectiveSort };
  const found = useQuery({
    queryKey: ["search", request],
    queryFn: ({ signal }) => api.search(request, signal),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
  const scored = useQuery({
    queryKey: [
      "candidate-scores",
      found.data?.results.map((v) => v.id).join(","),
    ],
    queryFn: () => api.scoreCandidates(found.data!.results),
    enabled: Boolean(found.data?.results.length),
  });
  const scoreById = useMemo(
    () => new Map(scored.data?.map((r) => [r.vn.id, r.matchPercent]) ?? []),
    [scored.data],
  );
  const reset = () => {
    setTerm("");
    setFilters({
      q: "",
      platform: "",
      length: "",
      year: "",
      rating: "",
      sort: "searchrank",
      page: 1,
    });
  };
  const filterCount = [
    filters.platform,
    filters.length,
    filters.year,
    filters.rating,
  ].filter(Boolean).length;
  const active = Boolean(
    term ||
    filterCount ||
    (filters.sort !== "rating" && filters.sort !== "searchrank"),
  );
  const years = useMemo(() => releaseYears(), []);
  const pageCount = found.data?.count
    ? Math.max(1, Math.ceil(found.data.count / PAGE_SIZE))
    : null;
  // Active filters as removable chips, so they stay visible with the panel closed.
  const chips = [
    filters.platform && {
      key: "platform" as const,
      label: platformLabels[filters.platform] ?? filters.platform,
    },
    filters.length && {
      key: "length" as const,
      label: lengths[Number(filters.length)],
    },
    filters.year && { key: "year" as const, label: `Since ${filters.year}` },
    filters.rating && {
      key: "rating" as const,
      label: `Rated ${filters.rating}.0+`,
    },
  ].filter(Boolean) as {
    key: "platform" | "length" | "year" | "rating";
    label: string;
  }[];
  const results = found.data?.results ?? [];
  return (
    <main className="page discover">
      <section className="page-head">
        <div>
          <h1>Discover a story</h1>
          <span className="jp" lang="ja">
            物語を見つける
          </span>
        </div>
        <label className="search-field big-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Search the catalogue"
            maxLength={100}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search titles and aliases…"
          />
        </label>
      </section>
      <div className="filter-bar">
        <button
          className="btn btn-small filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="discovery-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters{filterCount ? ` (${filterCount})` : ""}
        </button>
        <div
          id="discovery-filters"
          className={`filters ${filtersOpen ? "filters-open" : ""}`}
        >
          <label className="field">
            <span className="label">Platform</span>
            <select
              className="select"
              value={filters.platform}
              onChange={(e) => update("platform", e.target.value)}
            >
              <option value="">All platforms</option>
              {Object.entries(platformLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Length</span>
            <select
              className="select"
              value={filters.length}
              onChange={(e) => update("length", e.target.value)}
            >
              <option value="">Any length</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {lengths[n]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Released since</span>
            <select
              className="select"
              value={filters.year}
              onChange={(e) => update("year", e.target.value)}
            >
              <option value="">Any year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Minimum rating</span>
            <select
              className="select"
              value={filters.rating}
              onChange={(e) => update("rating", e.target.value)}
            >
              <option value="">Any rating</option>
              {[9, 8, 7, 6].map((n) => (
                <option key={n} value={n}>
                  {n}.0+
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="result-head" ref={resultHeading}>
        <p role="status" className="result-count">
          {found.isFetching && !found.data
            ? "Searching…"
            : found.data?.count != null
              ? `${found.data.count.toLocaleString()} ${found.data.count === 1 ? "story" : "stories"}`
              : `${results.length} shown`}
        </p>
        {chips.length > 0 && (
          <ul className="chips active-filters" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  className="chip"
                  aria-label={`Remove filter: ${chip.label}`}
                  onClick={() => update(chip.key, "")}
                >
                  {chip.label}
                  <X className="chip-remove" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="result-tools">
          {active && (
            <button className="link-button" onClick={reset}>
              Clear all
            </button>
          )}
          <label className="sort-control">
            <span className="label">Sort by</span>
            <select
              className="select"
              value={effectiveSort}
              onChange={(e) => update("sort", e.target.value)}
            >
              <option value="searchrank" disabled={!filters.q}>
                Best match
              </option>
              <option value="rating">Highest rated</option>
              <option value="votecount">Most popular</option>
              <option value="released">Newest</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>
      </div>
      {found.isError ? (
        <ErrorState
          message={found.error.message}
          retry={() => void found.refetch()}
        />
      ) : found.isLoading ? (
        <Loading />
      ) : results.length ? (
        <div
          className={`catalogue ${found.isPlaceholderData ? "is-refreshing" : ""}`}
          aria-busy={found.isFetching}
        >
          {results.map((v, index) => (
            <Card
              key={v.id}
              index={index}
              vn={v}
              match={scoreById.get(v.id)}
              onOpen={open}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No stories match.</h2>
          <p>Try a different search, or loosen one of the filters.</p>
          {active && (
            <button className="btn" onClick={reset}>
              Clear filters
            </button>
          )}
        </div>
      )}
      <nav className="pagination" aria-label="Search result pages">
        <button
          className="btn btn-small"
          disabled={filters.page === 1 || found.isFetching}
          onClick={() => changePage(filters.page - 1)}
        >
          ← Previous
        </button>
        <span aria-live="polite">
          Page {filters.page}
          {pageCount ? ` of ${pageCount.toLocaleString()}` : ""}
        </span>
        <button
          className="btn btn-small"
          disabled={!found.data?.more || found.isFetching || found.isError}
          onClick={() => changePage(filters.page + 1)}
        >
          Next →
        </button>
      </nav>
    </main>
  );
}
