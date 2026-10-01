import { useEffect, useRef } from "react";
import { useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import { createPortal } from "react-dom";
import type { View } from "../types";
import { easeOut } from "../lib/motion";
import { usePageViewport } from "../lib/viewport";
import { usePageScrollLock } from "../useModal";

const titles: Record<View, { chapter: string; en: string; jp: string }> = {
  home: { chapter: "Prologue", en: "Afterglow", jp: "夕映え" },
  discover: { chapter: "Chapter 01", en: "Discover", jp: "発見" },
  library: { chapter: "Chapter 02", en: "Library", jp: "書架" },
  taste: { chapter: "Chapter 03", en: "My taste", jp: "好み" },
};

/**
 * A quiet eyecatch between pages, like a chapter title card: a sheet of paper
 * sweeps across, names the chapter, and sweeps away. The page swaps underneath
 * while it is fully covered.
 */
export function Eyecatch({
  view,
  onCovered,
}: {
  view: View;
  onCovered: () => void;
}) {
  const title = titles[view];
  const viewportRef = usePageViewport<HTMLDivElement>();
  const covered = useRef(false);
  const present = useIsPresent();
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!present) clearTimeout(hold.current);
    return () => clearTimeout(hold.current);
  }, [present]);
  usePageScrollLock();
  return createPortal(
    <m.div ref={viewportRef} className="eyecatch" aria-hidden="true">
      <m.div
        className="eyecatch-paper"
        initial={{ x: "-112vw" }}
        animate={{ x: 0 }}
        transition={{ duration: 0.26, ease: easeOut }}
        exit={{ x: "112vw", transition: { duration: 0.3, ease: easeOut } }}
        onAnimationComplete={() => {
          if (!present || covered.current) return;
          covered.current = true;
          hold.current = setTimeout(onCovered, 140);
        }}
      >
        <m.div
          className="eyecatch-viewport"
          initial={{ x: "112vw" }}
          animate={{ x: 0 }}
          transition={{ duration: 0.26, ease: easeOut }}
          exit={{ x: "-112vw", transition: { duration: 0.3, ease: easeOut } }}
        >
          <m.div
            className="eyecatch-card"
            initial={{ y: 12, opacity: 0 }}
            animate={{
              y: 0,
              opacity: 1,
              transition: { delay: 0.1, duration: 0.25 },
            }}
          >
            <span className="eyecatch-chapter">{title.chapter}</span>
            <span className="eyecatch-rule" />
            <span className="eyecatch-en">{title.en}</span>
            <span className="eyecatch-jp jp" lang="ja">
              {title.jp}
            </span>
          </m.div>
        </m.div>
      </m.div>
    </m.div>,
    document.body,
  );
}
