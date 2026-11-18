import type {
  LibraryEntry,
  Preferences,
  Recommendation,
  VnSummary,
} from "@afterglow/shared";

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

type Components = {
  explicit: number;
  learned: number;
  constraints: number;
  quality: number;
  novelty: number;
};

function behaviorSignal(item: LibraryEntry) {
  let signal = item.favorite ? 2 : 0;
  if (item.status === "dropped") signal -= 2.5;
  else if (item.status === "completed") signal += 0.25;
  if (item.personalRating != null) {
    if (item.personalRating >= 8) signal += (item.personalRating - 7) * 0.75;
    else if (item.personalRating <= 4)
      signal -= (5 - item.personalRating) * 0.75;
  }
  return clamp(signal, -4, 4);
}

function learnedTaste(library: LibraryEntry[], includeSpoilers: boolean) {
  const learned = new Map<string, { name: string; weight: number }>();
  for (const item of library) {
    const signal = behaviorSignal(item);
    if (!signal) continue;
    for (const tag of item.vn.tags.filter(
      (tag) => includeSpoilers || tag.spoiler === 0,
    )) {
      const current = learned.get(tag.id)?.weight ?? 0;
      learned.set(tag.id, {
        name: tag.name,
        weight: current + signal * clamp(tag.rating / 3),
      });
    }
  }
  return learned;
}

function explicitFit(eligible: VnSummary["tags"], prefs: Preferences) {
  if (!prefs.tagPreferences.length)
    return { score: 0.5, positive: [] as string[], negative: [] as string[] };
  const tags = new Map(eligible.map((tag) => [tag.id, tag]));
  type Match = { name: string; strength: number; explain: boolean };
  const positive: Match[] = [];
  const negative: Match[] = [];
  for (const pref of prefs.tagPreferences) {
    const tag = tags.get(pref.id);
    if (!tag || !pref.weight) continue;
    const relevance = clamp(tag.rating / 3);
    const strength = (relevance * Math.abs(pref.weight)) / 3;
    if (strength <= 0) continue;
    (pref.weight > 0 ? positive : negative).push({
      name: pref.name,
      strength,
      explain: relevance >= 0.25 && tag.spoiler === 0,
    });
  }
  positive.sort((a, b) => b.strength - a.strength);
  negative.sort((a, b) => b.strength - a.strength);
  // One strong theme can carry a title. Reserve a smaller bonus for breadth.
  const attraction =
    0.8 * (positive[0]?.strength ?? 0) + 0.2 * (positive[1]?.strength ?? 0);
  const aversion = negative[0]?.strength ?? 0;
  return {
    score: clamp(0.5 + 0.5 * attraction - aversion),
    positive: positive
      .filter((match) => match.explain)
      .map((match) => match.name),
    negative: negative
      .filter((match) => match.explain)
      .map((match) => match.name),
  };
}

function learnedFit(
  tags: VnSummary["tags"],
  learned: Map<string, { name: string; weight: number }>,
  scale: number,
) {
  if (!learned.size) return { score: 0.5, matches: [] as string[] };
  let signed = 0,
    weight = 0;
  const matches: { name: string; value: number }[] = [];
  for (const tag of tags) {
    const value = (learned.get(tag.id)?.weight ?? 0) / scale;
    if (!value) continue;
    const relevance = clamp(tag.rating / 3);
    signed += value * relevance;
    weight += relevance;
    if (value > 0 && tag.spoiler === 0)
      matches.push({ name: tag.name, value: value * relevance });
  }
  const signal = weight
    ? clamp(signed / Math.max(1, Math.sqrt(weight)), -1, 1)
    : 0;
  return {
    score: clamp(0.5 + 0.5 * signal),
    matches: matches.sort((a, b) => b.value - a.value).map((x) => x.name),
  };
}

function constraintFit(vn: VnSummary, prefs: Preferences) {
  const checks: number[] = [];
  if (prefs.preferredLengths.length)
    checks.push(
      vn.length && prefs.preferredLengths.includes(vn.length) ? 1 : 0,
    );
  if (prefs.preferredPlatforms.length)
    checks.push(
      vn.platforms.some((platform) =>
        prefs.preferredPlatforms.includes(platform),
      )
        ? 1
        : 0,
    );
  return checks.length
    ? checks.reduce((a, b) => a + b, 0) / checks.length
    : 0.5;
}

function qualityFit(vn: VnSummary) {
  const rating = vn.rating == null ? 0.5 : clamp((vn.rating - 55) / 35);
  const popularity = clamp(Math.log10(Math.max(1, vn.voteCount)) / 4);
  return rating * 0.8 + popularity * 0.2;
}

function noveltyFit(tags: VnSummary["tags"], positive: Set<string>) {
  if (!positive.size || !tags.length) return 0.5;
  const familiar =
    tags.reduce(
      (sum, tag) => sum + (positive.has(tag.id) ? clamp(tag.rating / 3) : 0),
      0,
    ) / Math.max(1, Math.min(tags.length, 8));
  return clamp(1 - familiar * 0.65);
}

function profileConfidence(prefs: Preferences, library: LibraryEntry[]) {
  const explicit = Math.min(0.4, prefs.tagPreferences.length * 0.04);
  const behavior = Math.min(
    0.25,
    library.filter((item) => Math.abs(behaviorSignal(item)) >= 0.5).length *
      0.05,
  );
  return clamp(0.35 + explicit + behavior, 0.35, 1);
}

export function rankRecommendations(
  candidates: VnSummary[],
  library: LibraryEntry[],
  prefs: Preferences,
  excludeOwned = true,
  limit = 12,
): Recommendation[] {
  const owned = new Set(library.map((x) => x.vndbId));
  const includeSpoilers = prefs.useSpoilerTagsInRecommendations;
  const learned = learnedTaste(library, includeSpoilers);
  // These depend only on the library, so calculate them once for the batch.
  let learnedScale = 1;
  const familiarTags = new Set<string>();
  for (const [id, { weight }] of learned) {
    learnedScale = Math.max(learnedScale, Math.abs(weight));
    if (weight > 0) familiarTags.add(id);
  }
  const confidence = profileConfidence(prefs, library);
  return candidates
    .filter((v) => !excludeOwned || !owned.has(v.id))
    .map((v) => {
      const tags = includeSpoilers
        ? v.tags
        : v.tags.filter((tag) => tag.spoiler === 0);
      const explicit = explicitFit(tags, prefs);
      const learnedResult = learnedFit(tags, learned, learnedScale);
      const components: Components = {
        explicit: explicit.score,
        learned: learnedResult.score,
        constraints: constraintFit(v, prefs),
        quality: qualityFit(v),
        novelty: noveltyFit(tags, familiarTags),
      };
      const raw =
        (components.explicit * 0.55 +
          components.learned * 0.2 +
          components.constraints * 0.1 +
          components.quality * 0.1 +
          components.novelty * 0.05) *
        100;
      const score = 50 + confidence * (raw - 50);
      const reasons: string[] = [];
      if (explicit.positive.length)
        reasons.push(`Matches ${explicit.positive.slice(0, 2).join(" and ")}`);
      if (explicit.negative.length)
        reasons.push(`Includes a theme you avoid: ${explicit.negative[0]}`);
      if (learnedResult.matches.length)
        reasons.push(
          `Echoes themes from your favorites and ratings: ${learnedResult.matches.slice(0, 2).join(", ")}`,
        );
      if (v.length && prefs.preferredLengths.includes(v.length))
        reasons.push("Fits your preferred reading length");
      if (v.platforms.some((p) => prefs.preferredPlatforms.includes(p)))
        reasons.push("Available on a preferred platform");
      if ((v.rating ?? 0) >= 80) reasons.push("Highly rated by VNDB readers");
      else if ((v.rating ?? 0) >= 70)
        reasons.push("Well rated by VNDB readers");
      if (!reasons.length)
        reasons.push("A well-regarded discovery from the VNDB community");
      return {
        vn: v,
        score,
        matchPercent: Math.round(clamp(score, 0, 100)),
        reasons: reasons.slice(0, 3),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
