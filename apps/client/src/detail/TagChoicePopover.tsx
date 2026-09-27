import { useLayoutEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { createPortal } from "react-dom";
import type { VnSummary } from "@afterglow/shared";
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
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const place = () => {
      const popover = ref.current;
      if (!popover) return;
      const a = anchor.getBoundingClientRect();
      const list = anchor
        .closest(".detail-tag")
        ?.parentElement?.getBoundingClientRect();
      if (list && (a.bottom < list.top || a.top > list.bottom)) {
        onClose();
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
      setPos({ left, top, ready: true });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, onClose]);
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
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <strong className="tag-action-name">{tag.name}</strong>
      <div>
        {([3, 1, -3] as const).map((w) => (
          <button
            key={w}
            disabled={pending}
            aria-label={`${choice === w ? "Remove" : "Mark"} ${tag.name} as ${w === 3 ? "love" : w === 1 ? "like" : "avoid"}`}
            aria-pressed={choice === w}
            className={choice === w ? "selected" : ""}
            onClick={() => onChoose(w)}
          >
            {w === 3 ? "LOVE" : w === 1 ? "LIKE" : "AVOID"}
          </button>
        ))}
      </div>
    </m.div>,
    document.body,
  );
}
