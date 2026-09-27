import { useState } from "react";
import { EyeOff } from "lucide-react";
import type { VnSummary } from "@afterglow/shared";
import { coverIsSensitive } from "../lib/format";

export function Cover({
  vn,
  className = "",
  eager = false,
  compact = false,
}: {
  vn: VnSummary;
  className?: string;
  eager?: boolean;
  /** Thumbnails have no room for a reveal button, so they only show a marker. */
  compact?: boolean;
}) {
  const hidden = coverIsSensitive(vn);
  const [revealed, setRevealed] = useState<string | null>(null);
  const show = !hidden || revealed === vn.id;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasImage = Boolean(vn.imageUrl && vn.imageUrl !== failedUrl);
  return (
    <div className={`cover ${className}`}>
      {hasImage ? (
        <img
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={show ? "" : "is-blurred"}
          src={vn.imageUrl!}
          onError={() => setFailedUrl(vn.imageUrl)}
          alt={show ? `${vn.title} cover` : "Sensitive cover hidden"}
        />
      ) : (
        <span className="no-cover">No cover</span>
      )}
      {hasImage &&
        !show &&
        (compact ? (
          <span className="hidden-mark" title="Sensitive cover hidden">
            <EyeOff aria-hidden="true" />
          </span>
        ) : (
          <button
            className="reveal"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(vn.id);
            }}
          >
            Reveal cover
          </button>
        ))}
    </div>
  );
}

/** A soft, blurred copy of the cover behind featured titles. */
export function Glow({ vn }: { vn: VnSummary }) {
  if (!vn.imageUrl || coverIsSensitive(vn)) return null;
  return (
    <div
      className="glow"
      aria-hidden="true"
      style={{ backgroundImage: `url("${vn.imageUrl}")` }}
    />
  );
}
