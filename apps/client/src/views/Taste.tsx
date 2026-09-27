import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { ArrowRight, Info, Search, X } from "lucide-react";
import type { Preferences, VndbTag } from "@afterglow/shared";
import { platforms } from "@afterglow/shared";
import { api } from "../api";
import { invalidateMatches } from "../queries";
import { lengths, platformName } from "../lib/format";
import { Loading, ErrorState } from "../components/status";
import { TagIndex } from "./TagIndex";
export function Taste() {
  const qc = useQueryClient();
  const pref = useQuery({
    queryKey: ["preferences"],
    queryFn: api.preferences,
  });
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [index, setIndex] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  useEffect(() => {
    if (pref.data && !draft) setDraft(pref.data);
  }, [pref.data, draft]);
  const save = useMutation({
    mutationFn: api.savePreferences,
    onSuccess: (_data, variables) => {
      setSavedJson(JSON.stringify(variables));
      invalidateMatches(qc);
      qc.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  if (pref.isError && !draft)
    return (
      <main className="page">
        <ErrorState
          message={pref.error.message}
          retry={() => void pref.refetch()}
        />
      </main>
    );
  if (!draft)
    return (
      <main className="page">
        <Loading />
      </main>
    );
  const remove = (id: string) =>
    setDraft({
      ...draft,
      tagPreferences: draft.tagPreferences.filter((t) => t.id !== id),
    });
  const pick = (tag: VndbTag, weight: number) =>
    setDraft({
      ...draft,
      tagPreferences: [
        ...draft.tagPreferences.filter((t) => t.id !== tag.id),
        { id: tag.id, name: tag.name, weight },
      ],
    });
  const groups = [
    { title: "LOVE", weight: 3 },
    { title: "LIKE", weight: 1 },
    { title: "AVOID", weight: -3 },
  ];
  return (
    <main className="page">
      <section className="taste-title">
        <h1>YOUR TASTE, IN DETAIL.</h1>
        <small>あなたの「好き」を、もっと詳しく。</small>
        <button onClick={() => setIndex("")}>
          <Search /> Search 2,700+ VNDB tags…
        </button>
      </section>
      <div className="category-index">
        <button onClick={() => setIndex("cont")}>
          CONTENT TAGS<small>Story, character, and setting</small>
        </button>
        <button onClick={() => setIndex("ero")}>
          SEXUAL CONTENT<small>Explicit and sensitive material</small>
        </button>
        <button onClick={() => setIndex("tech")}>
          TECHNICAL TAGS<small>Structure, presentation, and mechanics</small>
        </button>
        <button className="browse-tags" onClick={() => setIndex("")}>
          BROWSE ALL TAGS →
        </button>
      </div>
      <div className="preference-ledger">
        {groups.map((group) => (
          <section key={group.title}>
            <h2>
              {group.title}
              <b>
                {
                  draft.tagPreferences.filter((t) => t.weight === group.weight)
                    .length
                }{" "}
                TAGS
              </b>
            </h2>
            {draft.tagPreferences
              .filter((t) => t.weight === group.weight)
              .map((t) => (
                <div className="preference-row" key={t.id}>
                  <span>{t.name}</span>
                  <b>
                    {t.weight > 0 ? "+" : ""}
                    {t.weight.toFixed(1)}
                  </b>
                  <button
                    aria-label={`Remove ${t.name} from ${group.title.toLowerCase()} tags`}
                    onClick={() => remove(t.id)}
                  >
                    <X />
                  </button>
                </div>
              ))}
            <button className="add-tag" onClick={() => setIndex("")}>
              + ADD TAG
            </button>
          </section>
        ))}
      </div>
      <div className="taste-options">
        <section>
          <h3>PREFERRED READING LENGTH</h3>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="checkbox"
                checked={draft.preferredLengths.includes(n)}
                onChange={() =>
                  setDraft({
                    ...draft,
                    preferredLengths: draft.preferredLengths.includes(n)
                      ? draft.preferredLengths.filter((x) => x !== n)
                      : [...draft.preferredLengths, n],
                  })
                }
              />
              {lengths[n]}
            </label>
          ))}
        </section>
        <section>
          <h3>PREFERRED PLATFORMS</h3>
          {platforms.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={draft.preferredPlatforms.includes(p)}
                onChange={() =>
                  setDraft({
                    ...draft,
                    preferredPlatforms: draft.preferredPlatforms.includes(p)
                      ? draft.preferredPlatforms.filter((x) => x !== p)
                      : [...draft.preferredPlatforms, p],
                  })
                }
              />
              {platformName(p)}
            </label>
          ))}
        </section>
        <button
          className="save-taste"
          disabled={save.isPending}
          onClick={() => save.mutate({ ...draft, completed: true })}
        >
          {save.isPending
            ? "SAVING…"
            : savedJson === JSON.stringify({ ...draft, completed: true })
              ? "PROFILE SAVED"
              : "SAVE TASTE PROFILE"}
          <ArrowRight />
        </button>
      </div>
      <label className="spoiler-rec-option">
        <input
          type="checkbox"
          checked={draft.useSpoilerTagsInRecommendations}
          onChange={(e) =>
            setDraft({
              ...draft,
              useSpoilerTagsInRecommendations: e.target.checked,
            })
          }
        />
        <span>
          <b>USE SPOILER TAGS PRIVATELY IN RECOMMENDATIONS</b>
          <small>
            Improves matching, but spoiler tag names never appear in cards or
            explanations.
          </small>
        </span>
      </label>
      {save.isError && <ErrorState message={save.error.message} />}
      <p className="taste-note">
        <Info /> Your ratings, favorites, dropped titles, and reading history
        also shape recommendations.
      </p>
      <AnimatePresence>
        {index !== null && (
          <TagIndex
            initialCategory={index}
            onClose={() => setIndex(null)}
            onPick={pick}
            selected={draft.tagPreferences}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
