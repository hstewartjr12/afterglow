import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as m from "motion/react-m";
import { Search, X } from "lucide-react";
import type { Preferences, VndbTag } from "@afterglow/shared";
import { api } from "../api";
import { useModal } from "../useModal";
import { ErrorState } from "../components/status";
export function TagIndex({
  onClose,
  onPick,
  selected,
  initialCategory,
}: {
  onClose: () => void;
  onPick: (t: VndbTag, w: number) => void;
  selected: Preferences["tagPreferences"];
  initialCategory: string;
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
  });
  return (
    <m.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <m.section
        ref={modalRef}
        tabIndex={-1}
        className="tag-index"
        initial={{ y: 25 }}
        animate={{ y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="VNDB tag index"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <header>
          <h2>VNDB TAG INDEX</h2>
          <span>
            VNDB RECORDS: {tags.data?.recordCount?.toLocaleString() ?? "—"}
          </span>
          <span>SHOWING {tags.data?.usableOnPage ?? 0} USABLE TAGS</span>
          <button aria-label="Close tag index" onClick={onClose}>
            <X />
          </button>
        </header>
        <label className="index-search">
          <Search />
          <input
            aria-label="Search VNDB tags"
            maxLength={100}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search every VNDB tag…"
          />
        </label>
        <div className="index-body">
          <aside>
            <b>FILTER BY CATEGORY</b>
            <button
              className={category === "" ? "active" : ""}
              onClick={() => {
                setCategory("");
                setPage(1);
              }}
            >
              All categories
            </button>
            <button
              className={category === "cont" ? "active" : ""}
              onClick={() => {
                setCategory("cont");
                setPage(1);
              }}
            >
              Content
            </button>
            <button
              className={category === "ero" ? "active" : ""}
              onClick={() => {
                setCategory("ero");
                setPage(1);
              }}
            >
              Sexual content
            </button>
            <button
              className={category === "tech" ? "active" : ""}
              onClick={() => {
                setCategory("tech");
                setPage(1);
              }}
            >
              Technical
            </button>
            <hr />
            <b>SPOILER POLICY</b>
            <p>
              Tag descriptions are shown. VN-specific spoiler tags remain
              hidden.
            </p>
          </aside>
          <div className="tag-results">
            <div className="tag-columns">
              <span>TAG NAME / DESCRIPTION</span>
              <span>TYPE</span>
              <span>USAGE</span>
              <span>ACTIONS</span>
            </div>
            {tags.isError ? (
              <ErrorState
                message={tags.error.message}
                retry={() => void tags.refetch()}
              />
            ) : tags.isLoading ? (
              <p className="index-loading" role="status">
                Consulting the index…
              </p>
            ) : !tags.data?.results.length ? (
              <p className="index-loading">
                No tags match. Try another search or category.
              </p>
            ) : (
              tags.data.results.map((tag) => (
                <article key={tag.id}>
                  <div>
                    <h3>{tag.name}</h3>
                    <p>
                      {tag.description ||
                        tag.aliases.join(", ") ||
                        "No description available."}
                    </p>
                  </div>
                  <span>
                    {tag.category === "cont"
                      ? "CONTENT"
                      : tag.category === "ero"
                        ? "SEXUAL"
                        : "TECH"}
                  </span>
                  <b>{tag.vnCount.toLocaleString()}</b>
                  <div>
                    {([3, 1, -3] as const).map((w) => (
                      <button
                        key={w}
                        aria-pressed={
                          selected.find((x) => x.id === tag.id)?.weight === w
                        }
                        className={
                          selected.find((x) => x.id === tag.id)?.weight === w
                            ? "selected"
                            : ""
                        }
                        onClick={() => onPick(tag, w)}
                      >
                        {w === 3 ? "LOVE" : w === 1 ? "LIKE" : "AVOID"}
                      </button>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
        <footer>
          <span>PAGE {tags.data?.page ?? page}</span>
          <button
            disabled={(tags.data?.page ?? page) === 1 || tags.isFetching}
            onClick={() => setPage(Math.max(1, (tags.data?.page ?? page) - 1))}
          >
            ← PREVIOUS
          </button>
          <button
            disabled={!tags.data?.more || tags.isFetching}
            onClick={() => setPage((tags.data?.page ?? page) + 1)}
          >
            NEXT →
          </button>
        </footer>
      </m.section>
    </m.div>
  );
}
