import type { VnSummary } from "@afterglow/shared";
import { activateOnKey, lengths, vndbRating } from "../lib/format";
import { Cover } from "./Cover";

export function Card({
  vn,
  onOpen,
  match,
}: {
  vn: VnSummary;
  onOpen: (v: VnSummary) => void;
  match?: number;
}) {
  const activate = () => onOpen(vn);
  const year = vn.released?.slice(0, 4);
  const length = lengths[vn.length || 0];
  return (
    <article
      role="button"
      tabIndex={0}
      className="vn-card"
      aria-label={match != null ? `${vn.title}, ${match}% match` : vn.title}
      onClick={activate}
      onKeyDown={activateOnKey(activate)}
    >
      <Cover vn={vn} />
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
    </article>
  );
}
