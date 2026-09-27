import { Info } from "lucide-react";

export function Loading({ count = 5 }: { count?: number }) {
  return (
    <div className="catalogue" role="status" aria-label="Loading visual novels">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" aria-hidden="true" key={i}>
          <span />
          <span />
          <span />
        </div>
      ))}
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
