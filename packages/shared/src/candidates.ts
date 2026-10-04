import type { LibraryEntry, Preferences } from "./index.ts";

const tagId = /^g\d+$/;

/** Select public theme IDs for retrieval without changing recommendation scoring. */
export function recommendationTagIds(
  library: LibraryEntry[],
  prefs: Preferences,
): string[] {
  const avoided = new Set(
    prefs.tagPreferences.filter((tag) => tag.weight < 0).map((tag) => tag.id),
  );
  const manual = [...prefs.tagPreferences]
    .filter(
      (tag) => tag.weight > 0 && tagId.test(tag.id) && !avoided.has(tag.id),
    )
    .sort((a, b) => b.weight - a.weight);
  const manualIds = [...new Set(manual.map((tag) => tag.id))];
  const learned = new Map<string, number>();
  for (const item of library) {
    // A dropped story or a low rating must not become a positive seed merely
    // because the story is also marked as a favorite.
    if (
      item.status === "dropped" ||
      (item.personalRating != null && item.personalRating <= 4)
    )
      continue;
    let signal = item.favorite ? 2 : 0;
    if (item.personalRating != null) {
      if (item.personalRating >= 8) signal += (item.personalRating - 7) * 0.75;
    }
    if (signal <= 0) continue;
    const relevanceById = new Map<string, number>();
    for (const tag of item.vn.tags) {
      if (
        !tagId.test(tag.id) ||
        avoided.has(tag.id) ||
        (!prefs.useSpoilerTagsInRecommendations && tag.spoiler !== 0)
      )
        continue;
      const relevance = Math.max(0, Math.min(1, tag.rating / 3));
      if (relevance > (relevanceById.get(tag.id) ?? 0))
        relevanceById.set(tag.id, relevance);
    }
    for (const [id, relevance] of relevanceById) {
      learned.set(id, (learned.get(id) ?? 0) + Math.min(4, signal) * relevance);
    }
  }
  const learnedIds = [...learned]
    .filter(([id, weight]) => weight > 0 && !manualIds.includes(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  // Keep explicit preferences first, while reserving up to two slots for the
  // themes readers have demonstrated they enjoy. Unused slots stay manual.
  const manualSlots = 8 - Math.min(2, learnedIds.length);
  return [
    ...manualIds.slice(0, manualSlots),
    ...learnedIds,
    ...manualIds.slice(manualSlots),
  ].slice(0, 8);
}
