import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { VnSummary } from "@afterglow/shared";
import { api } from "../api";
import { lengths, platformLabels } from "../lib/format";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/status";
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
  const years = [
    ...new Set([new Date().getFullYear(), 2025, 2020, 2015, 2010, 2000, 1990]),
  ];
  return (
    <main className="page">
      <section className="page-title">
        <h1>DISCOVER A STORY</h1>
        <small>物語を見つける</small>
        <label className="big-search">
          <Search />
          <input
            aria-label="Search the catalogue"
            maxLength={100}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search titles and aliases…"
          />
        </label>
      </section>
      <button
        className="filter-toggle"
        aria-expanded={filtersOpen}
        aria-controls="discovery-filters"
        onClick={() => setFiltersOpen(!filtersOpen)}
      >
        FILTERS {filterCount ? `(${filterCount})` : ""}
        <span>{filtersOpen ? "−" : "+"}</span>
      </button>
      <div
        id="discovery-filters"
        className={`filter-ledger ${filtersOpen ? "filters-open" : ""}`}
      >
        <label>
          PLATFORM
          <select
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
        <label>
          LENGTH
          <select
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
        <label>
          RELEASED SINCE
          <select
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
        <label>
          MINIMUM RATING
          <select
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
      <div className="result-head" ref={resultHeading}>
        <b role="status">
          {found.isFetching
            ? "SEARCHING…"
            : `SHOWING: ${found.data?.results.length ?? 0}${found.data?.count != null ? ` OF ${found.data.count.toLocaleString()}` : ""}`}
        </b>
        <div>
          {active && <button onClick={reset}>CLEAR FILTERS</button>}
          <label className="sort-control">
            SORT BY
            <select
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
      ) : found.data?.results.length ? (
        <div className="catalogue">
          {found.data.results.map((v) => (
            <Card key={v.id} vn={v} match={scoreById.get(v.id)} onOpen={open} />
          ))}
        </div>
      ) : (
        <div className="empty-ledger">
          <h2>NO STORIES MATCH.</h2>
          <p>Try broadening one or more filters.</p>
          {active && (
            <button className="ink-button" onClick={reset}>
              CLEAR FILTERS
            </button>
          )}
        </div>
      )}
      <nav className="pagination" aria-label="Search result pages">
        <button
          disabled={filters.page === 1 || found.isFetching}
          onClick={() => changePage(filters.page - 1)}
        >
          ← PREVIOUS
        </button>
        <span aria-live="polite">PAGE {filters.page}</span>
        <button
          disabled={!found.data?.more || found.isFetching || found.isError}
          onClick={() => changePage(filters.page + 1)}
        >
          NEXT →
        </button>
      </nav>
    </main>
  );
}
