import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as m from "motion/react-m";
import { Search, X } from "lucide-react";
import type { Preferences, VndbTag } from "@afterglow/shared";
import { api } from "../api";
import { useModal } from "../useModal";
import { PageOverlay } from "../components/PageOverlay";
import { plural, tagWeights, weightLabel } from "../lib/format";
import { ErrorState } from "../components/status";

const categories = [
  { id: "", label: "All categories" },
  { id: "cont", label: "Content" },
  { id: "ero", label: "Sexual content" },
  { id: "tech", label: "Technical" },
];
const categoryLabel: Record<string, string> = {
  cont: "Content",
  ero: "Sexual",
  tech: "Technical",
};

export function TagIndex({
  onClose,
  onPick,
  selected,
  initialCategory,
  focusWeight,
}: {
  onClose: () => void;
  onPick: (t: VndbTag, w: number) => void;
  selected: Preferences["tagPreferences"];
  initialCategory: string;
  /** Opened from a group's "Add tag": that choice leads each row. */
  focusWeight?: number;
}) {
  const modalRef = useModal<HTMLElement>();
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState(initialCategory);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(term.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);
  const tags = useQuery({
    queryKey: ["tags", q, page, category],
    queryFn: () => api.tags(q, page, category),
    placeholderData: keepPreviousData,
  });
  const focus = weightLabel(focusWeight);
  // The focused choice first, so "Add tag" under Like reads Like · Love · Avoid.
  const choices = focus
    ? [focus, ...tagWeights.filter((w) => w !== focus)]
    : tagWeights;
  const currentPage = tags.data?.page ?? page;
  return (
    <PageOverlay onDismiss={onClose}>
      <m.section
        ref={modalRef}
        tabIndex={-1}
        className="sheet tag-index"
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="VNDB tag index"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <header className="tag-index-head">
          <div>
            <h2>Tag index</h2>
            <p className="muted">
              {focus
                ? `Adding to ${focus.label}. You can also choose another group per tag.`
                : tags.data
                  ? `${plural(tags.data.recordCount, "tag")} from VNDB`
                  : "Every tag from VNDB"}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close tag index"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <label className="search-field index-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Search VNDB tags"
            maxLength={100}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search every VNDB tag…"
          />
        </label>
        <div
          className="chips index-categories"
          role="group"
          aria-label="Category"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              className="chip"
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setPage(1);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div
          className={`tag-results ${tags.isPlaceholderData ? "is-refreshing" : ""}`}
        >
          {tags.isError ? (
            <ErrorState
              message={tags.error.message}
              retry={() => void tags.refetch()}
            />
          ) : tags.isLoading ? (
            <p className="index-empty" role="status">
              Consulting the index…
            </p>
          ) : !tags.data?.results.length ? (
            <p className="index-empty">
              No tags match. Try another search or category.
            </p>
          ) : (
            tags.data.results.map((tag) => {
              const current = selected.find((x) => x.id === tag.id)?.weight;
              return (
                <article key={tag.id} className="tag-row">
                  <div className="tag-row-text">
                    <h3>{tag.name}</h3>
                    <p>
                      {tag.description ||
                        tag.aliases.join(", ") ||
                        "No description available."}
                    </p>
                  </div>
                  <span className="tag-row-meta">
                    <span className="label">{categoryLabel[tag.category]}</span>
                    <span className="mono">{plural(tag.vnCount, "title")}</span>
                  </span>
                  <div className="tag-row-actions">
                    {choices.map(({ weight: w, label }) => (
                      <button
                        key={w}
                        className={`tag-choice ${focus?.weight === w ? "is-focus" : ""}`}
                        aria-pressed={current === w}
                        onClick={() => onPick(tag, w)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })
          )}
        </div>
        <footer className="tag-index-foot">
          <span className="mono">Page {currentPage}</span>
          <button
            className="btn btn-small"
            disabled={currentPage === 1 || tags.isFetching}
            onClick={() => setPage(Math.max(1, currentPage - 1))}
          >
            ← Previous
          </button>
          <button
            className="btn btn-small"
            disabled={!tags.data?.more || tags.isFetching}
            onClick={() => setPage(currentPage + 1)}
          >
            Next →
          </button>
        </footer>
      </m.section>
    </PageOverlay>
  );
}
