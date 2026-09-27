import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../lib/motion";

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

function useCountUp(target: number | undefined, reduced: boolean) {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (target == null || reduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return value;
}

/**
 * The match score as a dating-sim style affinity meter: a ring that fills and
 * a number that counts up when a title comes into view.
 */
export function MatchScore({
  value,
  align,
  size = "large",
}: {
  value?: number;
  align?: "end";
  size?: "large" | "small";
}) {
  const reduced = useReducedMotion();
  const shown = useCountUp(value, reduced);
  // Start empty and fill on the next frame so the ring animates in.
  const [armed, setArmed] = useState(reduced);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const fraction =
    value == null || !armed ? 0 : Math.max(0, Math.min(1, value / 100));
  return (
    <div className={`affinity affinity-${size}`}>
      <div className="affinity-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="affinity-track" cx="50" cy="50" r={radius} />
          <circle
            className="affinity-fill"
            cx="50"
            cy="50"
            r={radius}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - fraction),
            }}
          />
        </svg>
        <span className="affinity-value">
          <span className="visually-hidden">{value ?? "Unknown"}% match</span>
          <span aria-hidden="true">
            {value == null ? "—" : shown}
            <small>%</small>
          </span>
        </span>
        <span className="affinity-heart" aria-hidden="true">
          ♥
        </span>
      </div>
      <span className="label">
        Match <MatchInfo align={align} />
      </span>
    </div>
  );
}
