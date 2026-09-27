import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as m from "motion/react-m";
import { ArrowRight } from "lucide-react";
import type { Preferences, VnSummary } from "@afterglow/shared";
import { api } from "../api";
import type { View } from "../types";
import { invalidateMatches } from "../queries";
import {
  altTitle,
  lengths,
  platformName,
  plural,
  vndbRating,
} from "../lib/format";
import { Cover, Glow } from "../components/Cover";
import { Card } from "../components/Card";
import { MatchScore } from "../components/MatchScore";
import { VnBox } from "../components/VnBox";
import { Loading, ErrorState } from "../components/status";
import { useToast } from "../components/Toasts";
import { Motes } from "../components/Motes";
import { easeOut } from "../lib/motion";

const STRIP_SIZE = 8;

/** First run: a handful of popular tags is enough to make recommendations personal. */
function Onboarding({ prefs }: { prefs: Preferences }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const tags = useQuery({
    queryKey: ["tags", "", 1, "cont"],
    queryFn: () => api.tags("", 1, "cont"),
  });
  const save = useMutation({
    mutationFn: api.savePreferences,
    onSuccess: (data, variables) => {
      qc.setQueryData(["preferences"], data);
      invalidateMatches(qc);
      if (variables.tagPreferences.length)
        toast("Taste saved. Your recommendations are updating.");
    },
  });
  const toggle = (tag: { id: string; name: string }) =>
    setPicked((all) =>
      all.some((t) => t.id === tag.id)
        ? all.filter((t) => t.id !== tag.id)
        : [...all, tag],
    );
  const finish = (chosen: typeof picked) =>
    save.mutate({
      ...prefs,
      completed: true,
      tagPreferences: [
        ...prefs.tagPreferences,
        ...chosen.map((t) => ({ ...t, weight: 3 })),
      ],
    });
  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div>
        <span className="label label-accent">Start here</span>
        <h2 id="onboarding-title">What do you love in a story?</h2>
        <p className="muted">
          Pick a few themes and Afterglow will tailor tonight’s picks. You can
          fine-tune everything later in My taste.
        </p>
      </div>
      {tags.isError ? (
        <ErrorState
          message={tags.error.message}
          retry={() => void tags.refetch()}
        />
      ) : (
        <div className="chips" aria-busy={tags.isLoading}>
          {tags.data?.results.slice(0, 24).map((tag) => (
            <button
              key={tag.id}
              className="chip"
              aria-pressed={picked.some((t) => t.id === tag.id)}
              onClick={() => toggle({ id: tag.id, name: tag.name })}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      <div className="onboarding-actions">
        <button
          className="btn btn-primary"
          disabled={!picked.length || save.isPending}
          onClick={() => finish(picked)}
        >
          {picked.length
            ? `Save ${plural(picked.length, "theme")}`
            : "Pick a few themes"}
          <ArrowRight aria-hidden="true" />
        </button>
        <button
          className="link-button"
          disabled={save.isPending}
          onClick={() => finish([])}
        >
          Skip for now
        </button>
      </div>
      {save.isError && <ErrorState message={save.error.message} />}
    </section>
  );
}

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
  const pref = useQuery({
    queryKey: ["preferences"],
    queryFn: api.preferences,
  });
  const [featured, setFeatured] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const all = recs.data ?? [];
  const top = all[featured % Math.max(all.length, 1)];
  const rest = all.filter((r) => r !== top);
  const strip = showAll ? rest : rest.slice(0, STRIP_SIZE);
  const newcomer =
    pref.data &&
    !pref.data.completed &&
    !pref.data.tagPreferences.length &&
    lib.data?.length === 0;
  const alt = top && altTitle(top.vn);
  return (
    <main className="home">
      {newcomer && <Onboarding prefs={pref.data!} />}
      {top ? (
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-sky" aria-hidden="true">
            <Glow vn={top.vn} />
            <div className="halftone" />
            <Motes />
          </div>
          <m.div
            key={`cover-${top.vn.id}`}
            layoutId={`cover-${top.vn.id}`}
            className="hero-cover"
            initial={{ opacity: 0, x: -24, rotate: -2 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.6, ease: easeOut }}
          >
            <div className="sprite-float">
              <Cover vn={top.vn} eager className="has-shadow" />
            </div>
          </m.div>
          <m.div
            key={`story-${top.vn.id}`}
            className="hero-story"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut, delay: 0.08 }}
          >
            <span className="label label-accent">Your next story</span>
            <h1 id="hero-title">{top.vn.title}</h1>
            {alt && <p className="hero-alt jp">{alt}</p>}
            <dl className="hero-facts">
              <div>
                <dt className="label">Reading time</dt>
                <dd>{lengths[top.vn.length || 0] || "Unknown"}</dd>
              </div>
              <div>
                <dt className="label">Released</dt>
                <dd>{top.vn.released?.slice(0, 4) || "Unknown"}</dd>
              </div>
              <div>
                <dt className="label">VNDB rating</dt>
                <dd>{vndbRating(top.vn.rating)} / 10</dd>
              </div>
              {top.vn.platforms.length > 0 && (
                <div>
                  <dt className="label">Platforms</dt>
                  <dd>
                    {top.vn.platforms.slice(0, 3).map(platformName).join(", ")}
                    {top.vn.platforms.length > 3 &&
                      ` +${top.vn.platforms.length - 3}`}
                  </dd>
                </div>
              )}
            </dl>
            <VnBox reasons={top.reasons} />
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => open(top.vn)}>
                Open story <ArrowRight aria-hidden="true" />
              </button>
              {all.length > 1 && (
                <button
                  className="menu-choice"
                  onClick={() => setFeatured((i) => (i + 1) % all.length)}
                >
                  Not tonight — show another
                </button>
              )}
            </div>
          </m.div>
          <aside className="hero-score">
            <MatchScore value={top.matchPercent} align="end" />
            <p className="muted">
              {lib.data?.length
                ? `${plural(lib.data.length, "story", "stories")} in your library`
                : "Your library is empty so far"}
            </p>
          </aside>
        </section>
      ) : recs.isLoading ? (
        <Loading count={4} />
      ) : (
        !recs.isError && (
          <section className="hero-empty">
            <h1>Find the story that stays with you.</h1>
            <p>
              Afterglow turns VNDB’s deep catalogue into recommendations shaped
              around your taste.
            </p>
            <button className="btn btn-primary" onClick={() => go("discover")}>
              Discover <ArrowRight aria-hidden="true" />
            </button>
          </section>
        )
      )}
      <section className="picks" aria-labelledby="picks-title">
        <header className="section-head">
          <h2 id="picks-title">Tonight’s picks</h2>
          <span className="jp" lang="ja">
            今夜のおすすめ
          </span>
        </header>
        {recs.isError ? (
          <ErrorState
            message={recs.error.message}
            retry={() => void recs.refetch()}
          />
        ) : (
          <div className="catalogue">
            {strip.map((r, index) => (
              <Card
                index={index}
                key={r.vn.id}
                vn={r.vn}
                match={r.matchPercent}
                onOpen={open}
              />
            ))}
          </div>
        )}
        {rest.length > STRIP_SIZE && (
          <div className="picks-more">
            <button className="btn" onClick={() => setShowAll(!showAll)}>
              {showAll
                ? "Show fewer"
                : `Show all ${rest.length} recommendations`}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
