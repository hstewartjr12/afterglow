import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useInstantLayoutTransition, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import { sheetTransition } from "../lib/motion";
import { usePageViewport } from "../lib/viewport";
import { usePageScrollLock } from "../useModal";

const phone = "(max-width: 800px)";
let pages = 0;
let sourceScroll = { left: 0, top: 0 };

const AsPage = createContext(false);
/** True once a phone dialog has become the document, and while it closes. */
export const useOverlayIsPage = () => useContext(AsPage);

/**
 * A dialog over the page. On phones it opens and closes as a fixed sheet over
 * the page, and while open becomes the document itself, so Safari paints its
 * content behind the floating toolbar.
 */
export function PageOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const layerRef = usePageViewport<HTMLDivElement>();
  const backdropRef = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  // Swapping between sheet and page moves everything on screen in page
  // coordinates; those jumps must not play as layout animations.
  const instant = useInstantLayoutTransition();
  const [mobile, setMobile] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(phone).matches,
  );
  const [entered, setEntered] = useState(false);
  const page = mobile && entered && present;
  // Where the sheet was scrolled when it became the page, and since.
  const sheetScroll = useRef(0);
  usePageScrollLock(!page);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(phone);
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    // Moving focus inside the dialog can scroll the locked page beneath it.
    const { scrollX: left, scrollY: top } = window;
    return () => {
      if (!pages) window.scrollTo(left, top);
    };
  }, []);
  useLayoutEffect(() => {
    if (!page) return;
    const backdrop = backdropRef.current;
    instant();
    if (pages++ === 0) {
      sourceScroll = { left: window.scrollX, top: window.scrollY };
      document.body.classList.add("mobile-dialog-page");
    }
    window.scrollTo(0, sheetScroll.current);
    const track = () => (sheetScroll.current = window.scrollY);
    window.addEventListener("scroll", track, { passive: true });
    return () => {
      window.removeEventListener("scroll", track);
      instant();
      if (--pages === 0) {
        document.body.classList.remove("mobile-dialog-page");
        window.scrollTo(sourceScroll.left, sourceScroll.top);
      }
      // Close as a sheet over the restored page, showing what was on screen.
      if (backdrop) backdrop.scrollTop = sheetScroll.current;
    };
  }, [page, instant]);
  return createPortal(
    <AsPage.Provider value={mobile && entered}>
      <m.div
        ref={layerRef}
        className={page ? "modal-layer is-page" : "modal-layer"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={sheetTransition}
        onAnimationComplete={() => {
          if (!present || entered) return;
          sheetScroll.current = backdropRef.current?.scrollTop ?? 0;
          setEntered(true);
        }}
      >
        <div
          ref={backdropRef}
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onDismiss();
          }}
        >
          {children}
        </div>
      </m.div>
    </AsPage.Provider>,
    document.body,
  );
}
