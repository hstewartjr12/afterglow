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
  const viewportStyle = usePageViewport();
  usePageScrollLock();
  return createPortal(
    <m.div
      className="eyecatch"
      style={viewportStyle}
      aria-hidden="true"
      initial={{ clipPath: "polygon(0 0, 0 0, -12% 100%, -12% 100%)" }}
      animate={{
        clipPath: "polygon(0 0, 112% 0, 100% 100%, -12% 100%)",
        transition: { duration: 0.26, ease: easeOut },
      }}
      exit={{
        clipPath: "polygon(112% 0, 112% 0, 100% 100%, 100% 100%)",
        transition: { duration: 0.3, ease: easeOut },
      }}
      onAnimationComplete={(definition) => {
        // Hold the title card for a beat before revealing the new page.
        if (definition !== "exit") setTimeout(onCovered, 140);
      }}
    >
      <div className="eyecatch-viewport">
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
      </div>
    </m.div>,
    document.body,
  );
}
