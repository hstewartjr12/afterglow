import { useState } from "react";
import type { VnSummary } from "@afterglow/shared";
export function Cover({
  vn,
  className = "",
  eager = false,
}: {
  vn: VnSummary;
  className?: string;
  eager?: boolean;
}) {
  const hidden = vn.imageSexual >= 1.5 || vn.imageViolence >= 1.5;
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
        <span className="no-cover">NO IMAGE</span>
      )}
      {hasImage && hidden && !show && (
        <button
          className="reveal"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(vn.id);
          }}
        >
          REVEAL COVER
        </button>
      )}
    </div>
  );
}
