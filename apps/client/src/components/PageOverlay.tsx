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
 * A dialog over the page, in the page's own coordinates so a cover can fly
 * from its card into it. Its paper sits in the document rather than in a fixed
 * layer, because iOS Safari clips fixed layers above its floating toolbar but
 * paints the document beneath it. On phones the dialog opens and closes over
 * the page, and while open becomes the document itself, so it scrolls with
 * Safari's toolbars.
 */
export function PageOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const layerRef = usePageViewport<HTMLDivElement>();
  const present = useIsPresent();
  // Swapping between overlay and page moves everything on screen in page
  // coordinates; those jumps must not play as layout animations.
  const instant = useInstantLayoutTransition();
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.(phone).matches ?? false,
  );
  const [entered, setEntered] = useState(false);
  const page = mobile && entered && present;
  // How far the sheet has scrolled as the page, so it closes where it was.
  const sheetScroll = useRef(0);
  // Locked while it covers the page; a phone dialog that has been the page
  // stays unlocked as it closes, since iOS Safari drops a scroll restored in
  // the same frame as the root's overflow changing.
  usePageScrollLock(!(mobile && entered));
  useEffect(() => {
    const media = window.matchMedia?.(phone);
    if (!media) return;
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
    const layer = layerRef.current;
    instant();
    if (pages++ === 0) {
      sourceScroll = { left: window.scrollX, top: window.scrollY };
      document.body.classList.add("mobile-dialog-page");
    }
    sheetScroll.current = 0;
    window.scrollTo(0, 0);
    const track = () => (sheetScroll.current = window.scrollY);
    window.addEventListener("scroll", track, { passive: true });
    return () => {
      window.removeEventListener("scroll", track);
      instant();
      if (--pages === 0) {
        document.body.classList.remove("mobile-dialog-page");
        window.scrollTo(sourceScroll.left, sourceScroll.top);
      }
      // Close over the restored page, showing what was on screen. The scroll
      // event would move the overlay too, but only after this commit.
      layer?.style.setProperty("--sheet-scroll", `${sheetScroll.current}px`);
      layer?.style.setProperty(
        "--overlay-top",
        `${window.scrollY + (window.visualViewport?.offsetTop ?? 0)}px`,
      );
    };
  }, [page, instant, layerRef]);
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
          if (present && !entered) setEntered(true);
        }}
      >
        <div
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
