export type DescriptionPart = { text: string; spoiler: boolean };

/** Split at the outer spoiler boundaries. An unclosed spoiler hides the rest. */
export function splitSpoilers(text: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  let depth = 0;
  let start = 0;
  for (const match of text.matchAll(/\[(\/?)spoiler\]/gi)) {
    const closing = Boolean(match[1]);
    if (closing && depth === 0) continue;
    if (closing ? depth === 1 : depth === 0) {
      parts.push({ text: text.slice(start, match.index), spoiler: closing });
      start = match.index + match[0].length;
    }
    depth += closing ? -1 : 1;
  }
  parts.push({ text: text.slice(start), spoiler: depth > 0 });
  return parts;
}
