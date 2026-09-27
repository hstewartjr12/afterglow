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
// VNDB descriptions use BBCode; drop spoiler blocks entirely and unwrap formatting tags.
export const clean = (s: string | null | undefined) =>
  s
    ?.replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, "")
    .replace(/\[\/?(?:url(?:=[^\]]*)?|b|i|u|s|raw|quote|code)\]/gi, "")
    .trim() || "No spoiler-free description is available.";
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
