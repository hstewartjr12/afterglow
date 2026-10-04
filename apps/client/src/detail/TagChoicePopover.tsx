import { useLayoutEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { createPortal } from "react-dom";
import type { VnSummary } from "@afterglow/shared";
import { tagWeights } from "../lib/format";
import { useReducedMotion } from "../lib/motion";

// Phrased as a visual novel choice, one per line.
const choiceText: Record<number, string> = {
  3: "I love stories with this",
  1: "I like it",
  [-3]: "I’d rather avoid it",
};
export function TagChoicePopover({
  anchor,
  tag,
  choice,
  pending,
  onChoose,
  onClose,
}: {
  anchor: HTMLElement;
  tag: VnSummary["tags"][number];
  choice?: number;
  pending: boolean;
  onChoose: (weight: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const scheduleRef = useRef<(() => void) | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    let frame: number | undefined;
    const place = () => {
      const popover = ref.current;
      if (!popover) return;
      const a = anchor.getBoundingClientRect();
      const list = anchor
        .closest(".detail-tag")
        ?.parentElement?.getBoundingClientRect();
      if (list && (a.bottom < list.top || a.top > list.bottom)) {
        closeRef.current();
        return;
      }
      const p = popover.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(a.right - p.width, window.innerWidth - p.width - 8),
      );
      const below = a.bottom + 6;
      const top =
        below + p.height <= window.innerHeight - 8
          ? below
          : Math.max(8, a.top - p.height - 6);
      setPos((previous) =>
        previous.ready && previous.left === left && previous.top === top
          ? previous
          : { left, top, ready: true },
      );
    };
    // Scroll events can arrive faster than a display refresh. Read layout only
    // once per frame, while the initial placement stays synchronous.
    const schedule = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        place();
      });
    };
    scheduleRef.current = schedule;
    place();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (frame !== undefined) cancelAnimationFrame(frame);
      scheduleRef.current = null;
    };
  }, [anchor]);
  // Parent updates can move the anchor (for example, when the synopsis loads).
  // Preserve that positioning check without replacing the event listeners.
  useLayoutEffect(() => {
    scheduleRef.current?.();
  }, [onClose, tag.name, choice]);
  return createPortal(
    <m.div
      ref={ref}
      className="tag-popover"
      role="group"
      aria-label={`Tune ${tag.name}`}
      style={{
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? "visible" : "hidden",
      }}
      initial={reduced ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: reduced ? 0 : -4,
        transition: { duration: reduced ? 0 : 0.1 },
      }}
      transition={reduced ? { duration: 0 } : undefined}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <strong className="tag-action-name">{tag.name}</strong>
      <p>How do you feel about stories with this?</p>
      <div className="choices">
        {tagWeights.map(({ weight: w, label }, i) => (
          <m.button
            key={w}
            disabled={pending}
            aria-label={`${choice === w ? "Remove" : "Mark"} ${tag.name} as ${label.toLowerCase()}`}
            aria-pressed={choice === w}
            className={`choice ${choice === w ? "selected" : ""}`}
            onClick={() => onChoose(w)}
            initial={reduced ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: reduced ? 0 : 0.04 * i,
              duration: reduced ? 0 : 0.2,
            }}
          >
            {w > 1 ? "♥ " : ""}
            {choiceText[w]}
          </m.button>
        ))}
      </div>
      {choice != null && <small>Choose it again to clear.</small>}
    </m.div>,
    document.body,
  );
}
