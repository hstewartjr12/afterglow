/** "Why it fits you", told the way a visual novel would: a dialogue box with a name plate. */
export function VnBox({
  reasons,
  speaker = "Afterglow",
}: {
  reasons: string[];
  speaker?: string;
}) {
  return (
    <figure className="vn-box">
      <figcaption className="vn-box-name">{speaker}</figcaption>
      <ul>
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <span className="vn-box-next" aria-hidden="true">
        ▼
      </span>
    </figure>
  );
}
