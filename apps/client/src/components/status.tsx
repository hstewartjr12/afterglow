import { Info } from "lucide-react";

const LOADING = "Now loading";

export function Loading({ count = 5 }: { count?: number }) {
  return (
    <div className="loading" role="status" aria-label="Loading visual novels">
      <p className="now-loading" aria-hidden="true">
        {LOADING.split("").map((char, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.06}s` }}>
            {char === " " ? " " : char}
          </span>
        ))}
        <span className="now-loading-dots">…</span>
      </p>
      <div className="catalogue">
        {Array.from({ length: count }, (_, i) => (
          <div className="skeleton-card" aria-hidden="true" key={i}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="notice" role="alert">
      <Info aria-hidden="true" />
      <div>
        <b className="label label-accent">The signal faded</b>
        <p>{message}</p>
        {retry && (
          <button className="btn btn-small" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
