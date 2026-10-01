import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import * as m from "motion/react-m";
import { sheetTransition } from "../lib/motion";
import { usePageViewport } from "../lib/viewport";
import { usePageScrollLock } from "../useModal";

const phone = "(max-width: 800px)";
let pages = 0;
let sourceScroll = { left: 0, top: 0 };
const AsPage = createContext(false);
export const useOverlayIsPage = () => useContext(AsPage);

/** Phone dialogs are the document from the first frame, including during exit.
 * Their paper never becomes a fixed or animated layer that Safari clips above
 * the floating toolbar. Only the content fades; there is no coordinate handoff.
 */
export function PageOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.(phone).matches ?? false,
  );
  const layerRef = usePageViewport<HTMLDivElement>(!mobile);
  usePageScrollLock(!mobile);
  useEffect(() => {
    const media = window.matchMedia?.(phone);
    if (!media) return;
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const { scrollX: left, scrollY: top } = window;
    if (!mobile)
      return () => {
        if (!pages) window.scrollTo(left, top);
      };
    if (pages++ === 0) {
      sourceScroll = { left, top };
      document.body.classList.add("mobile-dialog-page");
      window.scrollTo(0, 0);
    }
    return () => {
      if (--pages === 0) {
        document.body.classList.remove("mobile-dialog-page");
        window.scrollTo(sourceScroll.left, sourceScroll.top);
      }
    };
  }, [mobile]);
  return createPortal(
    <AsPage.Provider value={mobile}>
      <div
        ref={layerRef}
        className={mobile ? "modal-layer is-page" : "modal-layer"}
      >
        <m.div
          className="modal-backdrop"
          initial={mobile ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={mobile ? { duration: 0.12 } : sheetTransition}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onDismiss();
          }}
        >
          {children}
        </m.div>
      </div>
    </AsPage.Provider>,
    document.body,
  );
}
