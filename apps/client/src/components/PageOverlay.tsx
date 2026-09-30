import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as m from "motion/react-m";
import { usePageViewport } from "../lib/viewport";
import { usePageScrollLock } from "../useModal";

let mobilePages = 0;
let sourceScroll = { left: 0, top: 0 };

/** Mobile dialogs become the document so Safari paints their content behind its toolbar. */
export function PageOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const viewportStyle = usePageViewport();
  const [mobile, setMobile] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 800px)").matches,
  );
  usePageScrollLock(!mobile);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (!mobile) return;
    if (mobilePages++ === 0) {
      sourceScroll = { left: window.scrollX, top: window.scrollY };
      document.body.classList.add("mobile-dialog-page");
      window.scrollTo(0, 0);
    }
    return () => {
      if (--mobilePages === 0) {
        document.body.classList.remove("mobile-dialog-page");
        window.scrollTo(sourceScroll.left, sourceScroll.top);
      }
    };
  }, [mobile]);
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
