import { useEffect, useRef } from "react";

const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus in dialogs, prevent background scrolling, then restore focus. */
export function useModal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement &&
      !dialog.contains(document.activeElement)
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (
      dialog.querySelector<HTMLElement>(".index-search input") ??
      dialog.querySelector<HTMLElement>(focusable)
    )?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = [
        ...dialog.querySelectorAll<HTMLElement>(focusable),
        ...document.querySelectorAll<HTMLElement>(
          `.tag-popover ${focusable.split(", ").join(", .tag-popover ")}`,
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
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return ref;
}
