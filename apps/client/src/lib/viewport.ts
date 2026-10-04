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
    const viewport = window.visualViewport;
    const update = () => {
      const top = `${window.scrollY + (viewport?.offsetTop ?? 0)}px`;
      const height = `${viewport?.height ?? window.innerHeight}px`;
      // Window and visualViewport often report the same movement. Keep the
      // immediate update without invalidating styles twice for one position.
      if (element.style.getPropertyValue("--overlay-top") !== top)
        element.style.setProperty("--overlay-top", top);
      if (element.style.getPropertyValue("--overlay-height") !== height)
        element.style.setProperty("--overlay-height", height);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return ref;
}
