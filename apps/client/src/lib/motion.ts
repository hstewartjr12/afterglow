import { useEffect, useRef, useState } from "react";

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

/**
 * Props for a cover that flies between card and sheet. Motion moves it by
 * rewriting its transform each frame; WebKit repaints such an element every
 * frame unless it has its own compositor layer, so it gets one just for the flight.
 */
export function useFlightLayer<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  return {
    ref,
    onLayoutAnimationStart: () => {
      ref.current?.style.setProperty("will-change", "transform");
    },
    onLayoutAnimationComplete: () => {
      ref.current?.style.removeProperty("will-change");
    },
  };
}
