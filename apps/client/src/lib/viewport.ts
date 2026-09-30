import { useEffect, useState, type CSSProperties } from "react";

/** Place overlay content in the visible viewport while its paper covers the page. */
export function usePageViewport() {
  const read = () => ({
    top: window.scrollY + (window.visualViewport?.offsetTop ?? 0),
    height: window.visualViewport?.height ?? window.innerHeight,
  });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const update = () => setViewport(read());
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
  }, []);
  return {
    "--overlay-top": `${viewport.top}px`,
    "--overlay-height": `${viewport.height}px`,
  } as CSSProperties;
}
