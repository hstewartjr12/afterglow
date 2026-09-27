import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import type {
  LibraryEntry,
  LibraryInput,
  Recommendation,
  VnDetail,
  VnSummary,
} from "@afterglow/shared";
import { libraryStatuses } from "@afterglow/shared";
import { api } from "../api";
import { useModal } from "../useModal";
import { invalidateMatches } from "../queries";
import { lengths, clean, platformName, today } from "../lib/format";
import { Cover } from "../components/Cover";
import { Stamp } from "../components/Card";
import { ErrorState } from "../components/status";
import { TagChoicePopover } from "./TagChoicePopover";
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
  const [form, setForm] = useState<Partial<LibraryEntry>>({});
  const [allTags, setAllTags] = useState(false);
  const [spoilerLevel, setSpoilerLevel] = useState<0 | 1 | 2>(0);
  const [activeTag, setActiveTag] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (lib.isSuccess && !initialized.current) {
      initialized.current = true;
      if (current) setForm(current);
    }
  }, [current, lib.isSuccess]);
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (activeTag) setActiveTag(null);
      else onClose();
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [activeTag, onClose]);
  const save = useMutation({
    mutationFn: (input: LibraryInput) => api.saveLibrary(vn.id, input),
    onSuccess: (_data, input) => {
      setSavedJson(JSON.stringify(input));
      qc.invalidateQueries({ queryKey: ["library"] });
      invalidateMatches(qc);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.removeLibrary(vn.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library"] });
      invalidateMatches(qc);
      onClose();
    },
  });
  const taste = useMutation({
    mutationFn: api.savePreferences,
    onSuccess: (data) => {
      qc.setQueryData(["preferences"], data);
      invalidateMatches(qc);
    },
  });
  const d = detail.data ?? (vn as VnDetail);
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
    taste.mutate({
      ...pref.data,
      completed: true,
      tagPreferences:
        existing?.weight === weight
          ? rest
          : [...rest, { id: tag.id, name: tag.name, weight }],
    });
    setActiveTag(null);
  };
  const input: LibraryInput = {
    vn: d,
    status: form.status || "backlog",
    personalRating: form.personalRating ?? null,
    favorite: form.favorite ?? false,
    progress: form.progress ?? 0,
    notes: form.notes ?? "",
    startedAt: form.startedAt ?? null,
    completedAt: form.completedAt ?? null,
  };
  const submit = () => save.mutate(input);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (activeTag) setActiveTag(null);
          else onClose();
        }
      }}
    >
      <motion.article
        ref={modalRef}
        tabIndex={-1}
        className="detail-sheet"
        initial={{ y: 30 }}
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
        <button className="close" aria-label="Close details" onClick={onClose}>
          <X />
        </button>
        <aside className="detail-cover">
          <Cover vn={d} eager />
          <dl>
            <div>
              <dt>RELEASED</dt>
              <dd>{d.released || "—"}</dd>
            </div>
            <div>
              <dt>LENGTH</dt>
              <dd>{lengths[d.length || 0]}</dd>
            </div>
            <div>
              <dt>PLATFORM</dt>
              <dd>
                {d.platforms.slice(0, 5).map(platformName).join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt>VNDB ID</dt>
              <dd>{d.id}</dd>
            </div>
          </dl>
        </aside>
        <section className="detail-copy">
          <header>
            <div>
              <h1>{d.title}</h1>
              <p>{d.alttitle}</p>
            </div>
            <div className="detail-scores">
              <div>
                <b>AFTERGLOW MATCH</b>
                <Stamp>
                  {currentMatch?.matchPercent ?? "—"}
                  <small>/100</small>
                </Stamp>
              </div>
              <div>
                <b>VNDB RATING</b>
                <Stamp>
                  {d.rating ? (d.rating / 10).toFixed(1) : "—"}
                  <small>/10</small>
                </Stamp>
              </div>
            </div>
          </header>
          {detail.isError && (
            <ErrorState
              message={detail.error.message}
              retry={() => void detail.refetch()}
            />
          )}
          <div className="synopsis">
            <b>SYNOPSIS</b>
            <p>
              {detail.isPlaceholderData && !detail.isError
                ? "Loading synopsis…"
                : clean(d.description)}
            </p>
          </div>
          <div className="detail-tags">
            <div className="detail-tags-heading">
              <div>
                <b>TAGS ({visibleTags.length} SHOWN)</b>
                <small>
                  {hiddenTags
                    ? `${hiddenTags} SPOILER TAGS HIDDEN`
                    : "ALL TAGS SHOWN"}
                </small>
              </div>
              <div
                className="spoiler-level"
                role="group"
                aria-label="Visible spoiler tag level"
              >
                {(
                  [
                    { level: 0, label: "SAFE" },
                    { level: 1, label: "MINOR" },
                    { level: 2, label: "ALL" },
                  ] as const
                ).map((option) => (
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
            <div>
              {visibleTags
                .slice(0, allTags ? visibleTags.length : 18)
                .map((t) => {
                  const choice = pref.data?.tagPreferences.find(
                    (x) => x.id === t.id,
                  )?.weight;
                  const choiceLabel =
                    choice === 3
                      ? "LOVE"
                      : choice === 1
                        ? "LIKE"
                        : choice === -3
                          ? "AVOID"
                          : null;
                  return (
                    <article
                      data-tag-id={t.id}
                      className={`detail-tag spoiler-${t.spoiler} ${choiceLabel ? "is-rated" : ""} ${activeTag?.id === t.id ? "is-open" : ""}`}
                      key={t.id}
                    >
                      <button
                        className="tag-summary"
                        title={t.name}
                        aria-expanded={activeTag?.id === t.id}
                        aria-label={`${t.name}, relevance ${t.rating.toFixed(1)}${choiceLabel ? `, marked ${choiceLabel.toLowerCase()}` : ""}. Tune tag`}
                        onClick={(e) =>
                          setActiveTag(
                            activeTag?.id === t.id
                              ? null
                              : { id: t.id, anchor: e.currentTarget },
                          )
                        }
                      >
                        <em>
                          <span>{t.name}</span>
                          {t.spoiler > 0 && (
                            <mark>{t.spoiler === 1 ? "MINOR" : "MAJOR"}</mark>
                          )}
                        </em>
                        <i>
                          <u
                            style={{
                              width: `${Math.round((t.rating / 3) * 100)}%`,
                            }}
                          />
                        </i>
                        <small>{t.rating.toFixed(1)}</small>
                        <b
                          className={
                            choiceLabel ? choiceLabel.toLowerCase() : ""
                          }
                        >
                          {choiceLabel ?? "+ TUNE"}
                        </b>
                      </button>
                    </article>
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
            {visibleTags.length > 18 && (
              <button onClick={() => setAllTags(!allTags)}>
                {allTags ? "SHOW FEWER" : `VIEW ALL ${visibleTags.length} TAGS`}{" "}
                <ArrowRight />
              </button>
            )}
          </div>
          {taste.isError && <ErrorState message={taste.error.message} />}
          <div className="fit">
            <b>WHY IT FITS YOU</b>
            {(
              fit.data?.reasons ??
              recommendation?.reasons ?? [
                fit.isLoading
                  ? "Calculating your match…"
                  : "No personalized signals matched this title yet.",
              ]
            ).map((r, i) => (
              <p key={r}>
                <span>0{i + 1}</span>
                {r}
              </p>
            ))}
          </div>
        </section>
        <aside className="tracker">
          <h2>YOUR TRACKER</h2>
          <label>
            STATUS
            <select
              value={form.status || "backlog"}
              onChange={(e) => {
                const status = e.target.value as LibraryEntry["status"];
                // Record reading dates the first time a story is started or finished.
                setForm({
                  ...form,
                  status,
                  ...((status === "playing" || status === "completed") &&
                    !form.startedAt && { startedAt: today() }),
                  ...(status === "completed" && {
                    progress: 100,
                    completedAt: form.completedAt ?? today(),
                  }),
                });
              }}
            >
              {libraryStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {(form.startedAt || form.completedAt) && (
            <p className="reading-dates">
              {form.startedAt && <>STARTED {form.startedAt.slice(0, 10)}</>}
              {form.startedAt && form.completedAt && " · "}
              {form.completedAt && (
                <>FINISHED {form.completedAt.slice(0, 10)}</>
              )}
            </p>
          )}
          <label>
            YOUR RATING{" "}
            <b>
              {form.personalRating == null
                ? "UNRATED"
                : `${form.personalRating}/10`}
            </b>
            <input
              type="range"
              min="0"
              max="10"
              aria-valuetext={
                form.personalRating == null
                  ? "Unrated"
                  : `${form.personalRating} out of 10`
              }
              value={form.personalRating ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  personalRating: Number(e.target.value) || null,
                })
              }
            />
          </label>
          {form.personalRating != null && (
            <button
              className="clear-rating"
              onClick={() => setForm({ ...form, personalRating: null })}
            >
              CLEAR RATING
            </button>
          )}
          <label>
            PROGRESS <b>{form.progress ?? 0}%</b>
            <input
              type="range"
              min="0"
              max="100"
              value={form.progress ?? 0}
              onChange={(e) =>
                setForm({ ...form, progress: Number(e.target.value) })
              }
            />
          </label>
          <label>
            PRIVATE NOTES
            <textarea
              maxLength={5000}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.favorite ?? false}
              onChange={() => setForm({ ...form, favorite: !form.favorite })}
            />{" "}
            ADD TO FAVORITES
          </label>
          <button
            className="save-library"
            disabled={
              save.isPending || remove.isPending || lib.isPending || lib.isError
            }
            onClick={submit}
          >
            {save.isPending
              ? "SAVING…"
              : savedJson === JSON.stringify(input)
                ? "SAVED"
                : "SAVE TO LIBRARY"}
            <ArrowRight />
          </button>
          {current && (
            <button
              className="remove"
              disabled={save.isPending || remove.isPending}
              onClick={() => remove.mutate()}
            >
              REMOVE FROM LIBRARY
            </button>
          )}
          {(save.error || remove.error || lib.error) && (
            <ErrorState
              message={(save.error || remove.error || lib.error)!.message}
            />
          )}
        </aside>
      </motion.article>
    </motion.div>
  );
}
