import * as m from "motion/react-m";
import { useCallback, useEffect, useRef } from "react";
import type { VnSummary } from "@afterglow/shared";
import { lengths, vndbRating } from "../lib/format";
import {
  easeOut,
  sheetTransition,
  useFlightLayer,
  useReducedMotion,
} from "../lib/motion";
import { Cover } from "./Cover";
import { tintStyle, useCoverTint } from "../lib/coverColor";
import { QuickWishlist } from "./QuickWishlist";

/** Tilt the cover toward the pointer and move its light sheen, like a holo card. */
function useTilt(reduced: boolean) {
  const frame = useRef<number | undefined>(undefined);
  const pointer = useRef<{ card: HTMLElement; x: number; y: number } | null>(
    null,
  );
  const reset = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    for (const name of ["--rx", "--ry", "--mx", "--my"])
      pointer.current?.card.style.removeProperty(name);
    pointer.current = null;
  }, []);
  useEffect(() => reset, [reduced, reset]);
  return {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse" || reduced) return;
      pointer.current = {
        card: event.currentTarget,
        x: event.clientX,
        y: event.clientY,
      };
      if (frame.current !== undefined) return;
      // Fast mice emit several events per display frame. Measure and paint only
      // the latest position, without repeatedly forcing layout between writes.
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        const position = pointer.current;
        const cover = position?.card.querySelector<HTMLElement>(".cover");
        if (!position || !cover) return;
        const box = cover.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const x = (position.x - box.left) / box.width;
        const y = (position.y - box.top) / box.height;
        const { style } = position.card;
        style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
        style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
        style.setProperty("--mx", `${x * 100}%`);
        style.setProperty("--my", `${y * 100}%`);
      });
    },
    onPointerLeave: reset,
    onPointerCancel: reset,
  };
}

export function Card({
  vn,
  onOpen,
  match,
  index = 0,
}: {
  vn: VnSummary;
  onOpen: (v: VnSummary) => void;
  match?: number;
  /** Position in its grid, used to stagger the entrance. */
  index?: number;
}) {
  const activate = () => onOpen(vn);
  const reduced = useReducedMotion();
  const tilt = useTilt(reduced);
  const tint = useCoverTint(vn.imageUrl);
  const flight = useFlightLayer<HTMLDivElement>();
  const year = vn.released?.slice(0, 4);
  const length = lengths[vn.length || 0];
  return (
    <m.article
      className="vn-card tinted"
      style={tintStyle(tint)}
      {...tilt}
      // Transform strings run on the compositor; x/y would repaint every frame.
      initial={reduced ? false : { opacity: 0, transform: "translateY(18px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{
        duration: reduced ? 0 : 0.45,
        ease: easeOut,
        delay: reduced ? 0 : Math.min(index, 12) * 0.045,
      }}
    >
      <div className="card-open">
        <button
          type="button"
          className="card-open-button"
          aria-label={match != null ? `${vn.title}, ${match}% match` : vn.title}
          onClick={activate}
        />
        <m.div
          // The cover flies into the detail sheet; decorative, so off for reduced motion.
          layoutId={reduced ? undefined : `cover-${vn.id}`}
          transition={{ layout: sheetTransition }}
          {...flight}
          className="card-cover"
          onClick={activate}
        >
          <Cover vn={vn} />
        </m.div>
        <div className="card-body">
          <div className="card-top">
            {match != null && (
              <span className="match-pill">{match}% match</span>
            )}
            <span className="card-rating" title="VNDB rating">
              ★ {vndbRating(vn.rating)}
            </span>
          </div>
          <h3>{vn.title}</h3>
          <p className="card-meta">
            {[year, length].filter(Boolean).join(" · ") || "Release unknown"}
          </p>
          <p className="card-tags">
            {vn.tags
              .filter((t) => t.spoiler === 0)
              .slice(0, 3)
              .map((t) => t.name)
              .join(" · ")}
          </p>
        </div>
      </div>
      <QuickWishlist vn={vn} />
    </m.article>
  );
}
