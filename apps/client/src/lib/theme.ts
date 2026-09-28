import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./motion";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "afterglow-theme";

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies now.
  }
}

/** Light, dark, or follow the operating system; remembered per device. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);
  useEffect(() => applyTheme(choice), [choice]);
  /** Switch themes with a quick circular reveal spreading from the clicked button. */
  const change = (next: ThemeChoice, origin?: { x: number; y: number }) => {
    const swap = () => {
      applyTheme(next);
      setChoice(next);
    };
    if (!document.startViewTransition || prefersReducedMotion()) return swap();
    const root = document.documentElement;
    root.style.setProperty("--reveal-x", `${origin?.x ?? innerWidth / 2}px`);
    root.style.setProperty("--reveal-y", `${origin?.y ?? 0}px`);
    document.startViewTransition(swap);
  };
  return [choice, change] as const;
}
