import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ArrowRight, ChevronRight, Heart, Search } from "lucide-react";
import type { VnSummary } from "@afterglow/shared";
import { libraryStatuses } from "@afterglow/shared/constants";
import { api } from "../api";
import { activateOnKey, altTitle, plural, statusLabel } from "../lib/format";
import { easeOut } from "../lib/motion";
import { Cover } from "../components/Cover";
import { Loading, ErrorState } from "../components/status";
export function LibraryView({
  open,
  discover,
}: {
  open: (v: VnSummary) => void;
  discover: () => void;
}) {
  const lib = useQuery({ queryKey: ["library"], queryFn: api.library });
  const [filter, setFilter] = useState("all");
  const [term, setTerm] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState("updated");
  const shown = useMemo(() => {
    const query = term.trim().toLocaleLowerCase();
    return (lib.data ?? [])
      .filter(
        (item) =>
          (filter === "all" || item.status === filter) &&
          (!favoritesOnly || item.favorite) &&
          (!query ||
            [item.vn.title, item.vn.alttitle, item.notes].some((value) =>
              value?.toLocaleLowerCase().includes(query),
            )),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.vn.title.localeCompare(b.vn.title)
          : sort === "rating"
            ? (b.personalRating ?? -1) - (a.personalRating ?? -1)
            : sort === "progress"
              ? b.progress - a.progress
              : b.updatedAt.localeCompare(a.updatedAt),
      );
  }, [lib.data, filter, term, favoritesOnly, sort]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {
      all: lib.data?.length ?? 0,
      favorites: 0,
    };
    for (const item of lib.data ?? []) {
      result[item.status] = (result[item.status] ?? 0) + 1;
      if (item.favorite) result.favorites++;
    }
    return result;
  }, [lib.data]);
  const reading = (lib.data ?? []).filter((item) => item.status === "playing");
  const active = filter !== "all" || Boolean(term) || favoritesOnly;
  const reset = () => {
    setFilter("all");
    setTerm("");
    setFavoritesOnly(false);
  };
  return (
    <main className="page library">
      <section className="page-head library-head">
        <div>
          <h1>The stories you carry.</h1>
          <span className="jp" lang="ja">
            あなたが抱える、物語たち。
          </span>
        </div>
        <dl className="folio">
          {[
            ["Collected", counts.all],
            ["Reading", counts.playing ?? 0],
            ["Finished", counts.completed ?? 0],
            ["Favorites", counts.favorites],
          ].map(([label, value]) => (
            <div key={label}>
              <dd>{value}</dd>
              <dt className="label">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
      {reading.length > 0 && !active && (
        <section className="continue" aria-labelledby="continue-title">
          <h2 id="continue-title" className="label label-accent">
            Continue reading
          </h2>
          <div className="continue-shelf">
            {reading.map((item) => (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                className="continue-card"
                aria-label={`Continue ${item.vn.title}, ${item.progress}% read`}
                onClick={() => open(item.vn)}
                onKeyDown={activateOnKey(() => open(item.vn))}
              >
                <Cover vn={item.vn} compact className="has-shadow" />
                <div>
                  <h3>{item.vn.title}</h3>
                  <p className="progress-line">
                    <span className="progress">
                      <span style={{ width: `${item.progress}%` }} />
                    </span>
                    {item.progress}%
                  </p>
                  <p className="continue-note">
                    {item.notes || "Your next chapter is waiting."}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="library-tools">
        <div className="chips" role="group" aria-label="Library status">
          {["all", ...libraryStatuses].map((f) => (
            <button
              className="chip"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              key={f}
            >
              {f === "all" ? "All" : statusLabel(f)}{" "}
              <small>{counts[f] ?? 0}</small>
            </button>
          ))}
        </div>
        <div className="library-search-row">
          <label className="search-field library-search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search your library"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search titles and private notes…"
            />
          </label>
          <button
            className="chip favorite-filter"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
          >
            <Heart aria-hidden="true" /> Favorites
          </button>
          <label className="sort-control">
            <span className="label">Sort by</span>
            <select
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="updated">Recently updated</option>
              <option value="title">Title A–Z</option>
              <option value="rating">Your rating</option>
              <option value="progress">Reading progress</option>
            </select>
          </label>
        </div>
      </div>
      {lib.isError ? (
        <ErrorState
          message={lib.error.message}
          retry={() => void lib.refetch()}
        />
      ) : lib.isLoading ? (
        <Loading count={4} />
      ) : shown.length ? (
        <>
          <p className="result-count" role="status">
            {shown.length === counts.all
              ? plural(counts.all, "story", "stories")
              : `${shown.length} of ${plural(counts.all, "story", "stories")}`}
          </p>
          <div className="ledger">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((item, index) => {
                const alt = altTitle(item.vn);
                return (
                  <m.article
                    layout="position"
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className="ledger-row"
                    onClick={() => open(item.vn)}
                    onKeyDown={activateOnKey(() => open(item.vn))}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{
                      duration: 0.35,
                      ease: easeOut,
                      delay: Math.min(index, 10) * 0.03,
                    }}
                  >
                    <div className="ledger-thumb">
                      <Cover vn={item.vn} compact />
                      {item.favorite && (
                        <span className="ribbon" title="Favorite">
                          <span className="visually-hidden">Favorite</span>
                        </span>
                      )}
                    </div>
                    <div className="ledger-title">
                      <h3>{item.vn.title}</h3>
                      {alt && <p className="jp">{alt}</p>}
                    </div>
                    <span className={`status-pill status-${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span className="ledger-rating">
                      {item.personalRating ? (
                        <>
                          ★ {item.personalRating}
                          <small>/10</small>
                        </>
                      ) : (
                        <span className="muted">Unrated</span>
                      )}
                    </span>
                    <span
                      className="ledger-progress"
                      aria-label={`${item.progress}% complete`}
                    >
                      <span className="progress">
                        <span style={{ width: `${item.progress}%` }} />
                      </span>
                      <small>{item.progress}%</small>
                    </span>
                    <p className="ledger-note">
                      {item.notes || <span className="muted">No notes</span>}
                    </p>
                    <ChevronRight
                      className="ledger-chevron"
                      aria-hidden="true"
                    />
                  </m.article>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h2>{counts.all ? "No stories match." : "Your shelf is waiting."}</h2>
          <p>
            {counts.all
              ? "Try another title, status, or the favorites filter."
              : "Add a story from Discover to begin your reading ledger."}
          </p>
          <button
            className="btn btn-primary"
            onClick={counts.all ? reset : discover}
          >
            {counts.all ? "Clear filters" : "Discover stories"}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      )}
    </main>
  );
}
