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
