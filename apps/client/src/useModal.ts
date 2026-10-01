import { useEffect, useRef } from "react";

const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;
let originalOverflow = "";

/** Whether a dialog, menu or page transition currently covers the page. */
export const pageCovered = () => scrollLocks > 0;

/** Lock the root rather than clipping the body backgrounds at Safari's toolbar. */
export function usePageScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    if (scrollLocks++ === 0) {
      originalOverflow = root.style.overflow;
      root.style.overflow = "hidden";
    }
    return () => {
      if (--scrollLocks === 0) root.style.overflow = originalOverflow;
    };
  }, [enabled]);
}

/** Keep keyboard focus in dialogs, prevent background scrolling, then restore focus. */
export function useModal<T extends HTMLElement>({
  lockScroll = true,
}: { lockScroll?: boolean } = {}) {
  const ref = useRef<T>(null);
  usePageScrollLock(lockScroll);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement &&
      !dialog.contains(document.activeElement)
        ? document.activeElement
        : null;
    (
      dialog.querySelector<HTMLElement>(".index-search input") ??
      dialog.querySelector<HTMLElement>(focusable)
    )?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = [
        ...dialog.querySelectorAll<HTMLElement>(focusable),
        ...document.querySelectorAll<HTMLElement>(
          ".tag-popover button:not(:disabled), .tag-popover a[href]",
        ),
      ].filter(
        (element) =>
          !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      // Don't scroll the page to bring a partly off-screen opener into view.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}
