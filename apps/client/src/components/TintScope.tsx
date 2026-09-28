import { tintStyle, useCoverTint } from "../lib/coverColor";

/**
 * Applies a cover's tint to its children without adding a layout box
 * (display: contents), so it can sit inside grids and lists.
 */
export function TintScope({
  url,
  children,
}: {
  url: string | null | undefined;
  children: React.ReactNode;
}) {
  const tint = useCoverTint(url);
  return (
    <div className="tinted tint-scope" style={tintStyle(tint)}>
      {children}
    </div>
  );
}
