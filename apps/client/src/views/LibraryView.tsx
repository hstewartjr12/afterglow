import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Heart, Search } from "lucide-react";
import type { VnSummary } from "@afterglow/shared";
import { libraryStatuses } from "@afterglow/shared";
import { api } from "../api";
import { activateOnKey } from "../lib/format";
import { Cover } from "../components/Cover";
import { Stamp } from "../components/Card";
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
  const playing = lib.data?.find((item) => item.status === "playing");
  const active = filter !== "all" || Boolean(term) || favoritesOnly;
  const reset = () => {
    setFilter("all");
    setTerm("");
    setFavoritesOnly(false);
  };
  return (
    <main className="page">
      <section className="library-title">
        <div>
          <h1>THE STORIES YOU CARRY.</h1>
          <small>あなたが抱える、物語たち。</small>
        </div>
        <div className="folio">
          <b>
            {counts.all}
            <span>COLLECTED</span>
          </b>
          <b>
            {counts.playing ?? 0}
            <span>READING</span>
          </b>
          <b>
            {counts.completed ?? 0}
            <span>FINISHED</span>
          </b>
          <b>
            {counts.favorites}
            <span>FAVORITES</span>
          </b>
        </div>
      </section>
      <div className="tabs" role="group" aria-label="Library status">
        {["all", ...libraryStatuses].map((f) => (
          <button
            aria-pressed={filter === f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
            key={f}
          >
            {f.toUpperCase()} <small>{counts[f] ?? 0}</small>
          </button>
        ))}
      </div>
      <div className="library-tools">
        <label className="library-search">
          <Search />
          <input
            aria-label="Search your library"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search titles and private notes…"
          />
        </label>
        <button
          className="favorite-filter"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Heart size={16} /> FAVORITES
        </button>
        <label className="sort-control">
          SORT BY
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Recently updated</option>
            <option value="title">Title A–Z</option>
            <option value="rating">Your rating</option>
            <option value="progress">Reading progress</option>
          </select>
        </label>
      </div>
      {playing && !active && (
        <article
          role="button"
          tabIndex={0}
          className="current-reading"
          onClick={() => open(playing.vn)}
          onKeyDown={activateOnKey(() => open(playing.vn))}
        >
          <Cover vn={playing.vn} />
          <div>
            <span className="overline">CURRENTLY READING</span>
            <h2>{playing.vn.title}</h2>
            <b>{playing.progress}% COMPLETE</b>
            <i>
              <span style={{ width: `${playing.progress}%` }} />
            </i>
            <p>{playing.notes || "Your next chapter is waiting."}</p>
          </div>
        </article>
      )}
      {lib.isError ? (
        <ErrorState
          message={lib.error.message}
          retry={() => void lib.refetch()}
        />
      ) : lib.isLoading ? (
        <Loading />
      ) : shown.length ? (
        <>
          <p className="library-result-count" role="status">
            {shown.length} OF {counts.all} STORIES
          </p>
          <div className="library-ledger">
            {shown.map((item) => (
              <article
                role="button"
                tabIndex={0}
                onClick={() => open(item.vn)}
                onKeyDown={activateOnKey(() => open(item.vn))}
                key={item.id}
              >
                <Cover vn={item.vn} />
                <div>
                  <h3>
                    {item.vn.title}{" "}
                    {item.favorite && (
                      <Heart
                        className="favorite-mark"
                        size={14}
                        aria-label="Favorite"
                      />
                    )}
                  </h3>
                  <small>{item.vn.alttitle}</small>
                </div>
                <Stamp>{item.status.toUpperCase()}</Stamp>
                <b className="personal-score">
                  {item.personalRating ? `${item.personalRating}/10` : "—"}
                </b>
                <i aria-label={`${item.progress}% complete`}>
                  <span style={{ width: `${item.progress}%` }} />
                </i>
                <p>{item.notes || "No note recorded."}</p>
                <ChevronRight />
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-ledger">
          <h2>{counts.all ? "NO STORIES MATCH." : "YOUR SHELF IS WAITING."}</h2>
          <p>
            {counts.all
              ? "Try another title, status, or favorites filter."
              : "Add a story from Discover to begin your reading ledger."}
          </p>
          <button
            className="ink-button"
            onClick={counts.all ? reset : discover}
          >
            {counts.all ? "CLEAR FILTERS" : "DISCOVER STORIES"}
            <ArrowRight />
          </button>
        </div>
      )}
    </main>
  );
}
