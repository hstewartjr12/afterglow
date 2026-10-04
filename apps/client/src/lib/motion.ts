import { useRef, useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const listeners = new Set<() => void>();
let mediaSource: typeof window.matchMedia | undefined;
let mediaQuery: MediaQueryList | undefined;
let observedMedia: MediaQueryList | undefined;
let reduced = true;

const notify = () => {
  reduced = mediaQuery?.matches ?? true;
  listeners.forEach((listener) => listener());
};

function reducedMotionQuery() {
  const source =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia
      : undefined;
  if (source !== mediaSource) {
    observedMedia?.removeEventListener("change", notify);
    observedMedia = undefined;
    mediaSource = source;
    mediaQuery = source?.call(window, query);
    reduced = mediaQuery?.matches ?? true;
    if (mediaQuery && listeners.size) {
      mediaQuery.addEventListener("change", notify);
      observedMedia = mediaQuery;
    }
  }
  return mediaQuery;
}

function subscribe(listener: () => void) {
  const media = reducedMotionQuery();
  listeners.add(listener);
  if (media && listeners.size === 1) {
    media.addEventListener("change", notify);
    observedMedia = media;
    // A preference may change between the first render and subscription.
    // Read after attaching so subsequent changes arrive through the listener.
    reduced = media.matches;
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      observedMedia?.removeEventListener("change", notify);
      observedMedia = undefined;
    }
  };
}

/** Decorative motion is opt-out: reduced-motion users and environments without matchMedia get none. */
export function prefersReducedMotion() {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia(query).matches
  );
}

function reducedMotionSnapshot() {
  const media = reducedMotionQuery();
  // Refresh the first render after all listeners were detached. While the
  // store is observed, changes arrive through its event rather than polling.
  if (!listeners.size) reduced = media?.matches ?? true;
  return reduced;
}

export function useReducedMotion() {
  // Cards and decorative effects share one browser subscription, including
  // preference changes between rendering and subscribing.
  return useSyncExternalStore(subscribe, reducedMotionSnapshot, () => true);
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
