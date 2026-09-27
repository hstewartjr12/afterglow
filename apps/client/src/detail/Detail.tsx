import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ExternalLink, Heart, X } from "lucide-react";
import type {
  LibraryEntry,
  LibraryInput,
  Recommendation,
  VnDetail,
  VnSummary,
} from "@afterglow/shared";
import { libraryStatuses } from "@afterglow/shared/constants";
import { api } from "../api";
import { useModal } from "../useModal";
import { invalidateMatches } from "../queries";
import {
  altTitle,
  clean,
  lengths,
  platformName,
  statusLabel,
  today,
  vndbRating,
  weightLabel,
} from "../lib/format";
import { Cover, Glow } from "../components/Cover";
import { MatchScore } from "../components/MatchScore";
import { VnBox } from "../components/VnBox";
import { ErrorState } from "../components/status";
import { useToast } from "../components/Toasts";
import { TagChoicePopover } from "./TagChoicePopover";

type Tracker = Omit<LibraryInput, "vn">;
const emptyTracker: Tracker = {
  status: "backlog",
  personalRating: null,
  favorite: false,
  progress: 0,
  notes: "",
  startedAt: null,
  completedAt: null,
};
const trackerOf = (entry: Partial<LibraryEntry>): Tracker => ({
  status: entry.status ?? "backlog",
  personalRating: entry.personalRating ?? null,
  favorite: entry.favorite ?? false,
  progress: entry.progress ?? 0,
  notes: entry.notes ?? "",
  startedAt: entry.startedAt ?? null,
  completedAt: entry.completedAt ?? null,
});
const keyOf = (tracker: Tracker) => JSON.stringify(trackerOf(tracker));
const spoilerOptions = [
  { level: 0, label: "Hide" },
  { level: 1, label: "Minor" },
  { level: 2, label: "All" },
] as const;
const TAG_PREVIEW = 18;

export function Detail({
  vn,
  onClose,
  recommendation,
}: {
  vn: VnSummary;
  onClose: () => void;
  recommendation?: Recommendation;
}) {
  const modalRef = useModal<HTMLElement>();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ["detail", vn.id],
    queryFn: () => api.detail(vn.id),
    placeholderData: vn as VnDetail,
  });
  const fit = useQuery({
    queryKey: ["recommendation", vn.id],
    queryFn: () => api.recommendation(vn.id),
  });
  const lib = useQuery({ queryKey: ["library"], queryFn: api.library });
  const pref = useQuery({
    queryKey: ["preferences"],
    queryFn: api.preferences,
  });
  const current = lib.data?.find((x) => x.vndbId === vn.id);
  const [form, setForm] = useState<Tracker>(emptyTracker);
  // The last tracker state the server has, so we know what still needs saving.
  const [savedKey, setSavedKey] = useState(keyOf(emptyTracker));
  const [allTags, setAllTags] = useState(false);
  const [spoilerLevel, setSpoilerLevel] = useState<0 | 1 | 2>(0);
  // A tag that was just loved, for a brief heart burst.
  const [burst, setBurst] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (lib.isSuccess && !initialized.current) {
      initialized.current = true;
      if (current) {
        setForm(trackerOf(current));
        setSavedKey(keyOf(trackerOf(current)));
      }
    }
  }, [current, lib.isSuccess]);

  const d = detail.data ?? (vn as VnDetail);
  const input: LibraryInput = { vn: d, ...form };
  const formKey = keyOf(form);
  const inLibrary = Boolean(current);
  const dirty = formKey !== savedKey;

  const save = useMutation({
    mutationFn: (next: LibraryInput) => api.saveLibrary(vn.id, next),
    onSuccess: (_data, next) => {
      if (!inLibrary) toast(`Added ${vn.title} to your library`);
      setSavedKey(keyOf(next));
      qc.invalidateQueries({ queryKey: ["library"] });
      invalidateMatches(qc);
    },
  });
  // Titles already in the library save themselves shortly after each change.
  useEffect(() => {
    if (!inLibrary || !dirty || save.isPending || save.isError) return;
    const timer = setTimeout(() => save.mutate(input), 700);
    return () => clearTimeout(timer);
    // `input` is derived from formKey; listing it would restart the timer every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inLibrary, dirty, formKey, save.isPending, save.isError]);

  const restore = useMutation({
    mutationFn: (entry: LibraryInput) => api.saveLibrary(vn.id, entry),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library"] });
      invalidateMatches(qc);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.removeLibrary(vn.id),
    onSuccess: () => {
      const removed = input;
      qc.invalidateQueries({ queryKey: ["library"] });
      invalidateMatches(qc);
      onClose();
      toast(`Removed ${vn.title} from your library`, {
        label: "Undo",
        run: () => restore.mutate(removed),
      });
    },
  });
  const taste = useMutation({
    mutationFn: api.savePreferences,
    onSuccess: (data) => {
      qc.setQueryData(["preferences"], data);
      invalidateMatches(qc);
    },
  });

  const requestClose = () => {
    if (inLibrary && dirty && !save.isError) save.mutate(input);
    else if (
      !inLibrary &&
      dirty &&
      !window.confirm(`Discard your tracker notes for ${vn.title}?`)
    )
      return;
    onClose();
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (activeTag) setActiveTag(null);
      else closeRef.current();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [activeTag]);

  const visibleTags = d.tags.filter((t) => t.spoiler <= spoilerLevel);
  const hiddenTags = d.tags.length - visibleTags.length;
  const setSpoilers = (level: 0 | 1 | 2) => {
    setSpoilerLevel(level);
    setAllTags(false);
    setActiveTag(null);
  };
  const currentMatch = fit.data ?? recommendation;
  const setTag = (tag: VnSummary["tags"][number], weight: number) => {
    if (!pref.data) return;
    const existing = pref.data.tagPreferences.find((x) => x.id === tag.id);
    const rest = pref.data.tagPreferences.filter((x) => x.id !== tag.id);
    const clearing = existing?.weight === weight;
    taste.mutate({
      ...pref.data,
      completed: true,
      tagPreferences: clearing
        ? rest
        : [...rest, { id: tag.id, name: tag.name, weight }],
    });
    setActiveTag(null);
    if (weight > 1 && !clearing) {
      setBurst(tag.id);
      setTimeout(() => setBurst((b) => (b === tag.id ? null : b)), 900);
    }
  };
  const update = (patch: Partial<Tracker>) => {
    // A new edit is a fresh attempt, so let autosave try again after a failure.
    if (save.isError) save.reset();
    setForm((f) => ({ ...f, ...patch }));
  };
  const setStatus = (status: Tracker["status"]) =>
    update({
      status,
      // Record reading dates the first time a story is started or finished.
      ...((status === "playing" || status === "completed") &&
        !form.startedAt && { startedAt: today() }),
      ...(status === "completed" && {
        progress: 100,
        completedAt: form.completedAt ?? today(),
      }),
    });
  const alt = altTitle(d);
  const year = d.released?.slice(0, 4);
  const saveState = save.isPending
    ? "Saving…"
    : save.isError
      ? "Not saved"
      : dirty
        ? "Unsaved changes"
        : "All changes saved";

  return (
    <m.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (activeTag) setActiveTag(null);
          else requestClose();
        }
      }}
    >
      <m.article
        ref={modalRef}
        tabIndex={-1}
        className="sheet detail-sheet"
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={d.title}
        onMouseDown={(e) => {
          if (
            activeTag &&
            !(e.target as HTMLElement).closest(".detail-tag,.tag-popover")
          ) {
            setActiveTag(null);
          }
        }}
      >
        <Glow vn={d} />
        <button
          className="sheet-close icon-button"
          aria-label="Close details"
          onClick={requestClose}
        >
          <X />
        </button>
        <aside className="detail-cover">
          <m.div layoutId={`cover-${d.id}`}>
            <Cover vn={d} eager className="has-shadow" />
          </m.div>
        </aside>
        <header className="detail-head">
          <h1>{d.title}</h1>
          {alt && <p className="detail-alt jp">{alt}</p>}
          <p className="detail-meta">
            {[
              year,
              lengths[d.length || 0],
              d.platforms.slice(0, 4).map(platformName).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="detail-scores">
            <MatchScore value={currentMatch?.matchPercent} size="small" />
            <div className="score">
              <span className="score-value plain">
                {vndbRating(d.rating)}
                <small>/10</small>
              </span>
              <span className="label">VNDB rating</span>
            </div>
            <a
              className="vndb-link"
              href={`https://vndb.org/${d.id}`}
              target="_blank"
              rel="noreferrer"
            >
              View on VNDB <ExternalLink aria-hidden="true" />
            </a>
          </div>
        </header>
        <section className="detail-copy">
          {detail.isError && (
            <ErrorState
              message={detail.error.message}
              retry={() => void detail.refetch()}
            />
          )}
          <section className="synopsis" aria-labelledby="synopsis-title">
            <h2 id="synopsis-title" className="label label-accent">
              Synopsis
            </h2>
            <p>
              {detail.isPlaceholderData && !detail.isError
                ? "Loading synopsis…"
                : clean(d.description)}
            </p>
          </section>
          <section className="fit" aria-labelledby="fit-title">
            <h2 id="fit-title" className="label label-accent">
              Why it fits you
            </h2>
            <VnBox
              reasons={
                fit.data?.reasons ??
                recommendation?.reasons ?? [
                  fit.isLoading
                    ? "Calculating your match…"
                    : "No personalized signals matched this title yet.",
                ]
              }
            />
          </section>
          <section className="detail-tags" aria-labelledby="tags-title">
            <div className="detail-tags-head">
              <h2 id="tags-title" className="label label-accent">
                Tags <span className="muted">({visibleTags.length})</span>
              </h2>
              <div className="spoiler-control">
                <span className="label" id="spoiler-label">
                  Spoiler tags
                </span>
                <div
                  className="segmented"
                  role="group"
                  aria-labelledby="spoiler-label"
                >
                  {spoilerOptions.map((option) => (
                    <button
                      key={option.level}
                      aria-pressed={spoilerLevel === option.level}
                      onClick={() => setSpoilers(option.level)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="tags-hint">
              {hiddenTags
                ? `${hiddenTags} ${hiddenTags === 1 ? "tag gives" : "tags give"} away plot points and ${hiddenTags === 1 ? "is" : "are"} hidden. `
                : spoilerLevel
                  ? "Spoiler tags are visible. "
                  : ""}
              Bars show how strongly each tag applies. Rate a tag to teach
              Afterglow your taste.
            </p>
            <div className="tag-list">
              {visibleTags
                .slice(0, allTags ? visibleTags.length : TAG_PREVIEW)
                .map((t) => {
                  const choice = weightLabel(
                    pref.data?.tagPreferences.find((x) => x.id === t.id)
                      ?.weight,
                  );
                  const isOpen = activeTag?.id === t.id;
                  return (
                    <div
                      data-tag-id={t.id}
                      className={`detail-tag ${choice ? `is-${choice.label.toLowerCase()}` : ""} ${isOpen ? "is-open" : ""}`}
                      key={t.id}
                    >
                      <span className="tag-name">
                        {t.name}
                        {t.spoiler > 0 && (
                          <mark>{t.spoiler === 1 ? "Minor" : "Major"}</mark>
                        )}
                      </span>
                      <span
                        className="tag-strength"
                        title={`Applies ${t.rating.toFixed(1)} out of 3`}
                      >
                        <i>
                          <u
                            style={{
                              width: `${Math.round((t.rating / 3) * 100)}%`,
                            }}
                          />
                        </i>
                      </span>
                      <button
                        className="tag-rate"
                        aria-expanded={isOpen}
                        aria-label={`Rate ${t.name}${choice ? ` (${choice.past.toLowerCase()})` : ""}`}
                        onClick={(e) =>
                          setActiveTag(
                            isOpen
                              ? null
                              : { id: t.id, anchor: e.currentTarget },
                          )
                        }
                      >
                        {choice ? (
                          choice.past
                        ) : (
                          <>
                            <Heart aria-hidden="true" /> Rate
                          </>
                        )}
                      </button>
                      {burst === t.id && (
                        <span className="heart-burst" aria-hidden="true">
                          {Array.from({ length: 7 }, (_, i) => (
                            <i
                              key={i}
                              style={{ "--i": i } as React.CSSProperties}
                            >
                              ♥
                            </i>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
            <AnimatePresence>
              {activeTag &&
                (() => {
                  const tag = d.tags.find((t) => t.id === activeTag.id);
                  if (!tag) return null;
                  const choice = pref.data?.tagPreferences.find(
                    (x) => x.id === tag.id,
                  )?.weight;
                  return (
                    <TagChoicePopover
                      anchor={activeTag.anchor}
                      tag={tag}
                      choice={choice}
                      pending={!pref.data || taste.isPending}
                      onChoose={(w) => setTag(tag, w)}
                      onClose={() => setActiveTag(null)}
                    />
                  );
                })()}
            </AnimatePresence>
            {visibleTags.length > TAG_PREVIEW && (
              <button
                className="btn btn-small tags-more"
                onClick={() => setAllTags(!allTags)}
              >
                {allTags ? "Show fewer" : `Show all ${visibleTags.length} tags`}
              </button>
            )}
            {taste.isError && <ErrorState message={taste.error.message} />}
          </section>
        </section>
        <aside className="tracker" aria-labelledby="tracker-title">
          <div className="tracker-head">
            <h2 id="tracker-title">Your tracker</h2>
            {inLibrary && (
              <span
                className={`save-state ${save.isError ? "is-error" : ""}`}
                role="status"
              >
                {saveState}
              </span>
            )}
          </div>
          <fieldset className="tracker-field">
            <legend className="label">Status</legend>
            <div className="chips">
              {libraryStatuses.map((s) => (
                <label className="chip" key={s}>
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={form.status === s}
                    onChange={() => setStatus(s)}
                  />
                  {statusLabel(s)}
                </label>
              ))}
            </div>
            {(form.startedAt || form.completedAt) && (
              <p className="reading-dates">
                {form.startedAt && <>Started {form.startedAt.slice(0, 10)}</>}
                {form.startedAt && form.completedAt && " · "}
                {form.completedAt && (
                  <>Finished {form.completedAt.slice(0, 10)}</>
                )}
              </p>
            )}
          </fieldset>
          <fieldset className="tracker-field">
            <legend className="label">
              Your rating{" "}
              <b>
                {form.personalRating == null
                  ? "Unrated"
                  : `${form.personalRating}/10`}
              </b>
            </legend>
            <div className="rating-scale">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  aria-label={`Rate ${n} out of 10`}
                  aria-pressed={form.personalRating === n}
                  className={
                    form.personalRating != null && n <= form.personalRating
                      ? "is-filled"
                      : ""
                  }
                  onClick={() =>
                    update({
                      personalRating: form.personalRating === n ? null : n,
                    })
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            {form.personalRating != null && (
              <button
                className="link-button"
                onClick={() => update({ personalRating: null })}
              >
                Clear rating
              </button>
            )}
          </fieldset>
          <label className="tracker-field">
            <span className="label">
              Progress <b>{form.progress}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={form.progress}
              onChange={(e) => update({ progress: Number(e.target.value) })}
            />
          </label>
          <label className="tracker-field">
            <span className="label">Private notes</span>
            <textarea
              className="textarea"
              maxLength={5000}
              value={form.notes}
              placeholder="Routes finished, where you left off, thoughts…"
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
          <button
            className="chip favorite-toggle"
            aria-pressed={form.favorite}
            onClick={() => update({ favorite: !form.favorite })}
          >
            <Heart aria-hidden="true" />
            {form.favorite ? "Favorite" : "Add to favorites"}
          </button>
          {inLibrary ? (
            <>
              {save.isError && (
                <button
                  className="btn btn-primary tracker-save"
                  onClick={() => save.mutate(input)}
                >
                  Retry save
                </button>
              )}
              <button
                className="link-button tracker-remove"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Remove from library
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary tracker-save"
              disabled={save.isPending || lib.isPending || lib.isError}
              onClick={() => save.mutate(input)}
            >
              {save.isPending ? "Adding…" : "Add to library"}
            </button>
          )}
          {(save.error || remove.error || lib.error) && (
            <ErrorState
              message={(save.error || remove.error || lib.error)!.message}
            />
          )}
        </aside>
      </m.article>
    </m.div>
  );
}
