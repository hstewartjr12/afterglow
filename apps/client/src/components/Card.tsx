import * as m from "motion/react-m";
import type { VnSummary } from "@afterglow/shared";
import { lengths, activateOnKey } from "../lib/format";
import { Cover } from "./Cover";
export function Stamp({ children }: { children: React.ReactNode }) {
  return <span className="stamp">{children}</span>;
}
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
  return (
    <m.article
      role="button"
      tabIndex={0}
      whileHover={{ y: -4 }}
      className="vn-card"
      onClick={activate}
      onKeyDown={activateOnKey(activate)}
    >
      <Cover vn={vn} />
      <div className="card-data">
        {match != null && <Stamp>{match}/100 MATCH</Stamp>}
        <h3>{vn.title}</h3>
        {vn.alttitle && <small>{vn.alttitle}</small>}
        <dl>
          <div>
            <dt>{vn.released?.slice(0, 4) || "—"}</dt>
            <dd>{lengths[vn.length || 0] || "Unknown"}</dd>
          </div>
          <div>
            <dt className="red">
              {vn.rating ? (vn.rating / 10).toFixed(1) : "—"}/10
            </dt>
            <dd>
              {vn.tags
                .filter((t) => t.spoiler === 0)
                .slice(0, 3)
                .map((t) => t.name)
                .join(", ")}
            </dd>
          </div>
        </dl>
      </div>
    </m.article>
  );
}
