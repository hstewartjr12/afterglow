import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { prefersReducedMotion, useReducedMotion } from "./motion";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shares one preference listener and updates every subscriber", () => {
  let change: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: vi.fn((_event, listener: () => void) => {
      change = listener;
    }),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal("matchMedia", matchMedia);
  const first = renderHook(useReducedMotion);
  const second = renderHook(useReducedMotion);
  expect(first.result.current).toBe(false);
  expect(second.result.current).toBe(false);
  expect(matchMedia).toHaveBeenCalledTimes(1);
  expect(media.addEventListener).toHaveBeenCalledTimes(1);
  expect(prefersReducedMotion()).toBe(false);
  act(() => {
    media.matches = true;
    change?.();
  });
  expect(first.result.current).toBe(true);
  expect(second.result.current).toBe(true);
  first.unmount();
  expect(media.removeEventListener).not.toHaveBeenCalled();
  second.unmount();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", change);
});

it("does not poll the subscribed media query while components render", () => {
  const matches = vi.fn(() => false);
  const media = {
    get matches() {
      return matches();
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const view = renderHook(useReducedMotion);
  matches.mockClear();
  view.rerender();
  view.rerender();
  expect(matches).not.toHaveBeenCalled();
});

it("catches a preference change between rendering and attaching the listener", () => {
  const media = {
    matches: false,
    addEventListener: vi.fn(() => {
      media.matches = true;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  expect(renderHook(useReducedMotion).result.current).toBe(true);
});

it("starts with the current preference after every subscriber has unmounted", () => {
  const media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const first = renderHook(useReducedMotion);
  first.unmount();
  media.matches = true;
  const renders: boolean[] = [];
  renderHook(() => {
    const reduced = useReducedMotion();
    renders.push(reduced);
    return reduced;
  });
  expect(renders[0]).toBe(true);
});

it("disables decorative motion when matchMedia is unavailable", () => {
  vi.stubGlobal("matchMedia", undefined);
  expect(prefersReducedMotion()).toBe(true);
  expect(renderHook(useReducedMotion).result.current).toBe(true);
});
