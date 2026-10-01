import { useLayoutEffect, useRef } from "react";

/**
 * Place overlay content in the visible viewport while its paper covers the page.
 * The variables are written straight onto the element, so a scroll moves the
 * overlay before the next paint instead of after a React render.
 */
export function usePageViewport<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const update = () => {
      const viewport = window.visualViewport;
      element.style.setProperty(
        "--overlay-top",
        `${window.scrollY + (viewport?.offsetTop ?? 0)}px`,
      );
      element.style.setProperty(
        "--overlay-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return ref;
}
