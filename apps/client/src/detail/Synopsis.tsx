import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { parseDescription } from "../lib/format";

/**
 * The synopsis, spoiler-free by default. Each spoiler stays in place as a
 * small "Spoiler" pill that reveals just that passage; a header control
 * reveals or hides them all.
 */
export function Synopsis({ description }: { description: string | null }) {
  const parts = parseDescription(description);
  const spoilerCount = parts.filter((p) => p.spoiler).length;
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const hidden = spoilerCount - revealed.size;
  const allRevealed = spoilerCount > 0 && hidden === 0;
  const reveal = (index: number) =>
    setRevealed((current) => new Set(current).add(index));
  const toggleAll = () =>
    setRevealed(
      allRevealed
        ? new Set()
        : new Set(parts.flatMap((p, i) => (p.spoiler ? [i] : []))),
    );
  let spoilerIndex = -1;
  return (
    <>
      {spoilerCount > 0 && (
        <div className="synopsis-spoilers">
          <span className="muted">
            {allRevealed
              ? "Spoilers are showing."
              : `${hidden === 1 ? "1 spoiler is" : `${hidden} spoilers are`} hidden.`}
          </span>
          <button className="link-button" onClick={toggleAll}>
            {allRevealed ? (
              <>
                <EyeOff aria-hidden="true" /> Hide spoilers
              </>
            ) : (
              <>
                <Eye aria-hidden="true" /> Reveal all
              </>
            )}
          </button>
        </div>
      )}
      <p>
        {parts.length === 0
          ? "No description is available."
          : parts.map((part, i) => {
              if (!part.spoiler) return <span key={i}>{part.text}</span>;
              spoilerIndex++;
              const n = spoilerIndex + 1;
              return revealed.has(i) ? (
                <mark key={i} className="spoiler-text">
                  {part.text}
                </mark>
              ) : (
                <button
                  key={i}
                  className="spoiler-pill"
                  aria-label={`Reveal spoiler ${n} of ${spoilerCount}`}
                  onClick={() => reveal(i)}
                >
                  <EyeOff aria-hidden="true" /> Spoiler
                </button>
              );
            })}
      </p>
    </>
  );
}
