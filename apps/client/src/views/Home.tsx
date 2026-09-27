import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { VnSummary } from "@afterglow/shared";
import { api } from "../api";
import type { View } from "../types";
import { lengths } from "../lib/format";
import { Cover } from "../components/Cover";
import { Stamp, Card } from "../components/Card";
import { Loading, ErrorState } from "../components/status";
export function Home({
  go,
  open,
}: {
  go: (v: View) => void;
  open: (v: VnSummary) => void;
}) {
  const recs = useQuery({
    queryKey: ["recommendations"],
    queryFn: api.recommendations,
  });
  const lib = useQuery({ queryKey: ["library"], queryFn: api.library });
  const top = recs.data?.[0];
  return (
    <main>
      {top ? (
        <section className="editorial-hero">
          <div className="hero-cover">
            <Cover vn={top.vn} eager />
          </div>
          <div className="hero-story">
            <span className="overline">
              YOUR NEXT STORY / {new Date().getFullYear()}
            </span>
            <h1>{top.vn.title}</h1>
            {top.vn.alttitle && <p className="jp-title">{top.vn.alttitle}</p>}
            <p className="dek">
              {top.reasons[0]}. A recommendation drawn from the details that
              make your taste yours.
            </p>
            <div className="why">
              <b>WHY WE RECOMMEND THIS</b>
              {top.reasons.map((r) => (
                <p key={r}>→ {r}</p>
              ))}
            </div>
            <button className="ink-button" onClick={() => open(top.vn)}>
              OPEN STORY <ArrowRight />
            </button>
          </div>
          <aside className="hero-facts">
            <Stamp>
              {top.matchPercent}
              <small>/100</small>
            </Stamp>
            <dl>
              <div>
                <dt>READING TIME</dt>
                <dd>{lengths[top.vn.length || 0]}</dd>
              </div>
              <div>
                <dt>RELEASED</dt>
                <dd>{top.vn.released || "Unknown"}</dd>
              </div>
              <div>
                <dt>VNDB SCORE</dt>
                <dd>{top.vn.rating ? (top.vn.rating / 10).toFixed(1) : "—"}</dd>
              </div>
              <div>
                <dt>LIBRARY</dt>
                <dd>{lib.data?.length ?? 0} collected</dd>
              </div>
            </dl>
          </aside>
        </section>
      ) : recs.isLoading ? (
        <Loading />
      ) : (
        <section className="empty-hero">
          <h1>
            FIND THE STORY
            <br />
            THAT STAYS WITH YOU.
          </h1>
          <p>
            Afterglow turns VNDB’s deep catalogue into recommendations shaped
            around your taste.
          </p>
          <button className="ink-button" onClick={() => go("discover")}>
            DISCOVER <ArrowRight />
          </button>
        </section>
      )}
      <section className="recommend-strip">
        <div className="strip-title">
          <span>Tonight’s</span>
          <b>recommendations</b>
          <small>今夜のおすすめ</small>
        </div>
        {recs.isError ? (
          <ErrorState message={recs.error.message} />
        ) : (
          recs.data
            ?.slice(1, 5)
            .map((r) => (
              <Card
                key={r.vn.id}
                vn={r.vn}
                match={r.matchPercent}
                onOpen={open}
              />
            ))
        )}
      </section>
    </main>
  );
}
