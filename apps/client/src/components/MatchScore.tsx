import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "../lib/motion";

/**
 * Explains the match number wherever it appears prominently. The explanation is
 * rendered at the top level and kept inside the viewport, so scrolling sheets
 * and narrow screens never crop it.
 */
export function MatchInfo() {
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const id = useId();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const close = () => setPos(null);
  const toggle = () => {
    if (pos) return close();
    const box = button.current!.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(
      12,
      Math.min(
        box.left + box.width / 2 - width / 2,
        window.innerWidth - width - 12,
      ),
    );
    setPos({ left, top: box.bottom + 8 });
  };
  // Flip above the button when there is no room below.
  useLayoutEffect(() => {
    const el = popover.current;
    if (!el || !pos || !button.current) return;
    const height = el.offsetHeight;
    if (pos.top + height > window.innerHeight - 12) {
      const above = button.current.getBoundingClientRect().top - height - 8;
      const top = Math.max(12, above);
      if (top !== pos.top) setPos({ ...pos, top });
    }
  }, [pos]);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: Event) => {
      const target = e.target as Node;
      if (
        !popover.current?.contains(target) &&
        !button.current?.contains(target)
      )
        close();
    };
    // Capture on window runs before the detail sheet's Escape handler, so Escape
    // closes just this explanation, not the whole sheet.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      button.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);
  return (
    <>
      <button
        ref={button}
        className="info-button"
        aria-label="How matching works"
        aria-expanded={Boolean(pos)}
        aria-controls={pos ? id : undefined}
        onClick={toggle}
      >
        ?
      </button>
      {pos &&
        createPortal(
          <div
            ref={popover}
            id={id}
            role="note"
            className="info-pop"
            style={{ left: pos.left, top: pos.top }}
          >
            <p>
              <b>How well this title fits your taste, out of 100.</b>
            </p>
            <p>
              It mostly weighs the tags you love, like, and avoid, then what
              your ratings, favorites, and finished or dropped stories suggest,
              plus your preferred length and platforms and VNDB’s own rating.
            </p>
            <p className="muted">
              With little to go on, scores stay close to 50. They sharpen as you
              add tags and rate what you read.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Counts from the previously shown number, so changes glide instead of restarting at zero. */
function useCountUp(target: number | undefined, reduced: boolean) {
  const [value, setValue] = useState(reduced ? target : 0);
  const shown = useRef(value ?? 0);
  useEffect(() => {
    if (target == null || reduced) {
      setValue(target);
      return;
    }
    const from = shown.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const next = Math.round(
        from + (target - from) * (1 - Math.pow(1 - t, 3)),
      );
      shown.current = next;
      setValue(next);
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
  size = "large",
}: {
  value?: number;
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
        Match <MatchInfo />
      </span>
    </div>
  );
}
