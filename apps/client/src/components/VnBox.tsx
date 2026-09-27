import { useEffect, useState } from "react";
import { useReducedMotion } from "../lib/motion";

const CHARS_PER_TICK = 2;
const TICK_MS = 28;

/**
 * "Why it fits you", told the way a visual novel would: a dialogue box with a
 * name plate and text that types itself out. Clicking finishes the line at once.
 * Untyped text is present but transparent, so the box never jumps in size and
 * screen readers always get the full sentence.
 */
export function VnBox({
  reasons,
  speaker = "Afterglow",
}: {
  reasons: string[];
  speaker?: string;
}) {
  const reduced = useReducedMotion();
  const total = reasons.reduce((sum, r) => sum + r.length, 0);
  const key = reasons.join("\n");
  const [typed, setTyped] = useState({ key, count: reduced ? total : 0 });
  const count = typed.key === key ? typed.count : reduced ? total : 0;
  const done = count >= total;
  useEffect(() => {
    if (done) return;
    const timer = setInterval(
      () =>
        setTyped((t) => ({
          key,
          count: Math.min(
            total,
            (t.key === key ? t.count : 0) + CHARS_PER_TICK,
          ),
        })),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, [done, key, total]);
  let remaining = count;
  return (
    <figure
      className={`vn-box ${done ? "is-done" : "is-typing"}`}
      onClick={() => setTyped({ key, count: total })}
    >
      <figcaption className="vn-box-name">{speaker}</figcaption>
      <ul>
        {reasons.map((reason) => {
          const shown = Math.max(0, Math.min(reason.length, remaining));
          remaining -= reason.length;
          return (
            <li key={reason} className={shown ? "" : "is-pending"}>
              <span>{reason.slice(0, shown)}</span>
              <span className="vn-rest">{reason.slice(shown)}</span>
            </li>
          );
        })}
      </ul>
      <span className="vn-box-next" aria-hidden="true">
        ▼
      </span>
    </figure>
  );
}
