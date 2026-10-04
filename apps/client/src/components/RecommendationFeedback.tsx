import { RotateCcw } from "lucide-react";
import {
  useRecommendationFeedback,
  useRecommendationFeedbackActions,
} from "../lib/recommendationFeedback";
import { ErrorState } from "./status";

/** Mount in My taste to review and restore persistent recommendation choices. */
export function RecommendationFeedbackPanel() {
  const feedback = useRecommendationFeedback();
  const actions = useRecommendationFeedbackActions();
  return (
    <section
      className="recommendation-choices"
      aria-labelledby="recommendation-choices-title"
    >
      <h2 id="recommendation-choices-title">Hidden and postponed stories</h2>
      <p className="muted">
        Restore a story whenever you’d like to see it in your recommendations
        again.
      </p>
      {feedback.isPending ? (
        <p role="status">Loading your recommendation choices…</p>
      ) : feedback.isError ? (
        <ErrorState
          message={feedback.error.message}
          retry={() => void feedback.refetch()}
        />
      ) : feedback.active.length ? (
        <ul className="recommendation-choices-list">
          {feedback.active.map((item) => (
            <li key={item.vndbId}>
              <div>
                <h3>{item.vn.title}</h3>
                <p className="muted">
                  {item.until === null
                    ? "Hidden until restored"
                    : `Postponed until ${new Date(item.until).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                </p>
              </div>
              <button
                className="btn btn-small"
                disabled={actions.pending}
                aria-label={`Restore ${item.vn.title}`}
                onClick={() => actions.restoreTitle(item.vndbId)}
              >
                <RotateCcw aria-hidden="true" /> Restore
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No stories are hidden or postponed.</p>
      )}
      {actions.restore.isError && (
        <ErrorState
          message={actions.restore.error.message}
          retry={() =>
            actions.restore.variables &&
            actions.restoreTitle(actions.restore.variables)
          }
        />
      )}
    </section>
  );
}
