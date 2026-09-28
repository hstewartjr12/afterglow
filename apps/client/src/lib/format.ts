export const lengths = [
  "",
  "Very short",
  "Short",
  "Medium",
  "Long",
  "Very long",
];
/** The last five years, then every fifth year back to 1980 (the API's lower bound). */
export function releaseYears(current = new Date().getFullYear()) {
  const years: number[] = [];
  for (let y = current; y > current - 5; y--) years.push(y);
  for (let y = Math.floor((current - 5) / 5) * 5; y >= 1980; y -= 5)
    years.push(y);
  return years;
}
export const platformLabels: Record<string, string> = {
  win: "Windows",
  lin: "Linux",
  mac: "macOS",
  and: "Android",
  ios: "iOS",
  swi: "Nintendo Switch",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
};
export type DescriptionPart = { text: string; spoiler: boolean };
const formatting = /\[\/?(?:url(?:=[^\]]*)?|b|i|u|s|raw|quote|code)\]/gi;
/**
 * VNDB descriptions use BBCode. Formatting tags are unwrapped and the text is
 * split into plain and [spoiler] parts, so spoilers can stay hidden until the
 * reader asks for them. An unclosed [spoiler] hides the rest of the text.
 */
export function parseDescription(
  s: string | null | undefined,
): DescriptionPart[] {
  if (!s) return [];
  const parts: DescriptionPart[] = [];
  const pattern = /\[spoiler\]([\s\S]*?)(?:\[\/spoiler\]|$)/gi;
  let last = 0;
  for (const match of s.matchAll(pattern)) {
    parts.push({ text: s.slice(last, match.index), spoiler: false });
    parts.push({ text: match[1], spoiler: true });
    last = match.index + match[0].length;
  }
  parts.push({ text: s.slice(last), spoiler: false });
  const cleaned = parts
    .map((p) => ({ ...p, text: p.text.replace(formatting, "") }))
    .filter((p) => p.text.trim());
  // Trim only the outer edges so spacing between parts is kept.
  if (cleaned.length) {
    cleaned[0].text = cleaned[0].text.trimStart();
    cleaned[cleaned.length - 1].text =
      cleaned[cleaned.length - 1].text.trimEnd();
  }
  return cleaned;
}
export const platformName = (p: string) => platformLabels[p] ?? p.toUpperCase();
export const today = () => new Date().toISOString().slice(0, 10);
export function activateOnKey(activate: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      activate();
    }
  };
}

// One vocabulary everywhere: the stored values stay VNDB-style, the words are reader-facing.
export const statusLabels: Record<string, string> = {
  wishlist: "Wishlist",
  backlog: "Backlog",
  playing: "Reading",
  completed: "Finished",
  dropped: "Dropped",
};
export const statusLabel = (status: string) => statusLabels[status] ?? status;
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;
export const vndbRating = (rating: number | null | undefined) =>
  rating ? (rating / 10).toFixed(1) : "—";
/** Alternate titles are only worth showing when they add something. */
export const altTitle = (vn: { title: string; alttitle?: string | null }) =>
  vn.alttitle &&
  vn.alttitle.trim().toLowerCase() !== vn.title.trim().toLowerCase()
    ? vn.alttitle
    : null;
export const coverIsSensitive = (vn: {
  imageSexual: number;
  imageViolence: number;
}) => vn.imageSexual >= 1.5 || vn.imageViolence >= 1.5;
export const tagWeights = [
  { weight: 3, label: "Love", past: "Loved" },
  { weight: 1, label: "Like", past: "Liked" },
  { weight: -3, label: "Avoid", past: "Avoided" },
] as const;
export const weightLabel = (weight: number | undefined) =>
  tagWeights.find((w) => w.weight === weight);
