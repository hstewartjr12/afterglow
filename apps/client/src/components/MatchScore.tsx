import { useEffect, useRef } from "react";

/** Explains the match number wherever it appears prominently. */
export function MatchInfo({ align }: { align?: "end" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const details = ref.current;
      if (details?.open && !details.contains(e.target as Node))
        details.open = false;
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <details className="info" ref={ref}>
      <summary aria-label="How matching works">?</summary>
      <div className={`info-pop ${align === "end" ? "align-end" : ""}`}>
        <p>
          <b>How well this title fits your taste, out of 100.</b>
        </p>
        <p>
          It mostly weighs the tags you love, like, and avoid, then what your
          ratings, favorites, and finished or dropped stories suggest, plus your
          preferred length and platforms and VNDB’s own rating.
        </p>
        <p className="muted">
          With little to go on, scores stay close to 50. They sharpen as you add
          tags and rate what you read.
        </p>
      </div>
    </details>
  );
}

export function MatchScore({
  value,
  align,
}: {
  value?: number;
  align?: "end";
}) {
  return (
    <div className="score">
      <span className="score-value">
        {value ?? "—"}
        <small>%</small>
      </span>
      <span className="label">
        Match <MatchInfo align={align} />
      </span>
    </div>
  );
}
