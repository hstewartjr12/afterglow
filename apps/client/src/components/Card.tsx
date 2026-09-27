import * as m from "motion/react-m";
import type { VnSummary } from "@afterglow/shared";
import { activateOnKey, lengths, vndbRating } from "../lib/format";
import { easeOut, prefersReducedMotion } from "../lib/motion";
import { Cover } from "./Cover";

/** Tilt the cover toward the pointer and move its light sheen, like a holo card. */
function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
  const card = e.currentTarget;
  const cover = card.querySelector<HTMLElement>(".cover");
  if (!cover) return;
  const box = cover.getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width;
  const y = (e.clientY - box.top) / box.height;
  card.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
  card.style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
  card.style.setProperty("--mx", `${x * 100}%`);
  card.style.setProperty("--my", `${y * 100}%`);
}
function untilt(e: React.PointerEvent<HTMLElement>) {
  for (const name of ["--rx", "--ry", "--mx", "--my"])
    e.currentTarget.style.removeProperty(name);
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
  const year = vn.released?.slice(0, 4);
  const length = lengths[vn.length || 0];
  return (
    <m.article
      role="button"
      tabIndex={0}
      className="vn-card"
      aria-label={match != null ? `${vn.title}, ${match}% match` : vn.title}
      onClick={activate}
      onKeyDown={activateOnKey(activate)}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        ease: easeOut,
        delay: Math.min(index, 12) * 0.045,
      }}
    >
      <m.div layoutId={`cover-${vn.id}`} className="card-cover">
        <Cover vn={vn} />
      </m.div>
      <div className="card-body">
        <div className="card-top">
          {match != null && <span className="match-pill">{match}% match</span>}
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
    </m.article>
  );
}
