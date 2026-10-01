import { useEffect, useState } from "react";

const query = "(prefers-reduced-motion: reduce)";

/** Decorative motion is opt-out: reduced-motion users and environments without matchMedia get none. */
export function prefersReducedMotion() {
  return (
    typeof window.matchMedia !== "function" || window.matchMedia(query).matches
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setReduced(list.matches);
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return reduced;
}

export const easeOut = [0.2, 0.7, 0.2, 1] as const;

/** Dialogs fade in while a cover flies from its card, so both share one timing. */
export const sheetTransition = { duration: 0.35, ease: easeOut };

/** WebKit pays heavily for shared-layout covers inside full-page dialogs. */
export function useSimpleDetailMotion() {
  const reduced = useReducedMotion();
  return (
    reduced ||
    (/AppleWebKit/i.test(navigator.userAgent) &&
      !/Chrome|Chromium|Edg|OPR|Android/i.test(navigator.userAgent)) ||
    window.matchMedia?.("(max-width: 800px)").matches
  );
}
