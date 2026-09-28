import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ArrowRight, Check, Info, Plus, Search, X } from "lucide-react";
import type { Preferences, VndbTag } from "@afterglow/shared";
import { platforms } from "@afterglow/shared/constants";
import { api } from "../api";
import { invalidateMatches } from "../queries";
import { lengths, plural, platformName, tagWeights } from "../lib/format";
import { Loading, ErrorState } from "../components/status";
import { TagIndex } from "./TagIndex";
// `completed` only records that a profile was ever saved, so it never makes a draft dirty.
const profileKey = (p: Preferences) =>
  JSON.stringify({ ...p, completed: true });
export function Taste({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const pref = useQuery({
    queryKey: ["preferences"],
    queryFn: api.preferences,
  });
  const [draft, setDraft] = useState<Preferences | null>(null);
  // The open tag index: which category to start in, and which group "Add tag" came from.
  const [index, setIndex] = useState<{
    category: string;
    weight?: number;
  } | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  useEffect(() => {
    if (pref.data && !draft) {
      setDraft(pref.data);
      setBaseline(profileKey(pref.data));
    }
  }, [pref.data, draft]);
  const dirty = Boolean(draft && baseline && profileKey(draft) !== baseline);
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const save = useMutation({
    mutationFn: api.savePreferences,
    onSuccess: (_data, variables) => {
      setSavedJson(JSON.stringify(variables));
      setBaseline(profileKey(variables));
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
  const categories = [
    { id: "cont", title: "Content", hint: "Story, characters, and setting" },
    {
      id: "ero",
      title: "Sexual content",
      hint: "Explicit and sensitive material",
    },
    {
      id: "tech",
      title: "Technical",
      hint: "Structure, presentation, and mechanics",
    },
  ];
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  return (
    <main className="page taste">
      <section className="page-head">
        <div>
          <h1>Your taste, in detail.</h1>
          <span className="jp" lang="ja">
            あなたの「好き」を、もっと詳しく。
          </span>
        </div>
        <button
          className="search-field tag-search-trigger"
          onClick={() => setIndex({ category: "" })}
        >
          <Search aria-hidden="true" />
          <span>Search 2,700+ VNDB tags…</span>
        </button>
      </section>
      <div className="category-index">
        {categories.map((c) => (
          <button key={c.id} onClick={() => setIndex({ category: c.id })}>
            <b>{c.title}</b>
            <small>{c.hint}</small>
          </button>
        ))}
        <button
          className="browse-tags"
          onClick={() => setIndex({ category: "" })}
        >
          <b>Browse all tags →</b>
        </button>
      </div>
      <div className="preference-groups">
        {tagWeights.map((group) => {
          const tags = draft.tagPreferences.filter(
            (t) => t.weight === group.weight,
          );
          return (
            <section
              key={group.label}
              className={`preference-group group-${group.label.toLowerCase()}`}
              aria-labelledby={`group-${group.label}`}
            >
              <header>
                <h2 id={`group-${group.label}`}>{group.label}</h2>
                <span className="label">{plural(tags.length, "tag")}</span>
              </header>
              <ul className="chips">
                <AnimatePresence initial={false} mode="popLayout">
                  {tags.map((t) => (
                    <m.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                    >
                      <span className="chip preference-chip">
                        {t.name}
                        <button
                          className="chip-remove"
                          aria-label={`Remove ${t.name} from ${group.label.toLowerCase()} tags`}
                          onClick={() => remove(t.id)}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    </m.li>
                  ))}
                </AnimatePresence>
                <li>
                  <button
                    className="chip add-tag"
                    onClick={() =>
                      setIndex({ category: "", weight: group.weight })
                    }
                  >
                    <Plus aria-hidden="true" /> Add tag
                  </button>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
      <div className="taste-options">
        <fieldset>
          <legend className="label">Preferred reading length</legend>
          <div className="chips">
            {[1, 2, 3, 4, 5].map((n) => (
              <label className="chip" key={n}>
                <input
                  type="checkbox"
                  checked={draft.preferredLengths.includes(n)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      preferredLengths: toggle(draft.preferredLengths, n),
                    })
                  }
                />
                <Check className="chip-check" aria-hidden="true" />
                {lengths[n]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Preferred platforms</legend>
          <div className="chips">
            {platforms.map((p) => (
              <label className="chip" key={p}>
                <input
                  type="checkbox"
                  checked={draft.preferredPlatforms.includes(p)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      preferredPlatforms: toggle(draft.preferredPlatforms, p),
                    })
                  }
                />
                <Check className="chip-check" aria-hidden="true" />
                {platformName(p)}
              </label>
            ))}
          </div>
        </fieldset>
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
            <b>Use spoiler tags privately in recommendations</b>
            <small>
              Improves matching, but spoiler tag names never appear in cards or
              explanations.
            </small>
          </span>
        </label>
      </div>
      <p className="taste-note">
        <Info aria-hidden="true" /> Your ratings, favorites, dropped titles, and
        reading history also shape recommendations.
      </p>
      <div className={`save-bar ${dirty ? "is-dirty" : ""}`}>
        <p role="status">
          {save.isPending
            ? "Saving…"
            : dirty
              ? "Unsaved changes — save to update your recommendations."
              : "Your taste profile is up to date."}
        </p>
        <button
          className="btn btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate({ ...draft, completed: true })}
        >
          {save.isPending
            ? "Saving…"
            : savedJson === JSON.stringify({ ...draft, completed: true })
              ? "Profile saved"
              : "Save taste profile"}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      {save.isError && <ErrorState message={save.error.message} />}
      <AnimatePresence>
        {index !== null && (
          <TagIndex
            initialCategory={index.category}
            focusWeight={index.weight}
            onClose={() => setIndex(null)}
            onPick={pick}
            selected={draft.tagPreferences}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
