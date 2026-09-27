import { Info } from "lucide-react";
export function Loading() {
  return (
    <div className="catalogue" role="status" aria-label="Loading visual novels">
      {[1, 2, 3, 4, 5].map((x) => (
        <div className="paper-skeleton" aria-hidden="true" key={x} />
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
      <Info />
      <div>
        <b>THE SIGNAL FADED</b>
        <p>{message}</p>
        {retry && (
          <button className="retry-button" onClick={retry}>
            TRY AGAIN
          </button>
        )}
      </div>
    </div>
  );
}
