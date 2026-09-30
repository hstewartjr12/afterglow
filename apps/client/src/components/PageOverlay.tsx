import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import * as m from "motion/react-m";
import { usePageViewport } from "../lib/viewport";

/** Page-sized paper paints behind Safari's controls; dialog content scrolls above them. */
export function PageOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const viewportStyle = usePageViewport();
  return createPortal(
    <m.div
      className="modal-layer"
      style={viewportStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onDismiss();
        }}
      >
        {children}
      </div>
    </m.div>,
    document.body,
  );
}
