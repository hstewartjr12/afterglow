import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VnBox } from "./VnBox";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("finishes typing and stops its timer when reduced motion is enabled", () => {
  vi.useFakeTimers();
  let change: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: (_event: string, listener: () => void) => {
      change = listener;
    },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const view = render(<VnBox reasons={["A quietly moving story."]} />);
  act(() => vi.advanceTimersByTime(28));
  expect(view.container.querySelector(".vn-rest")).toHaveTextContent(
    "quietly moving story.",
  );
  act(() => {
    media.matches = true;
    change?.();
  });
  expect(view.container.querySelector(".vn-rest")).toBeEmptyDOMElement();
  expect(view.container.querySelector(".vn-box")).toHaveClass("is-done");
  expect(vi.getTimerCount()).toBe(0);
  act(() => {
    media.matches = false;
    change?.();
  });
  expect(view.container.querySelector(".vn-rest")).toBeEmptyDOMElement();
  expect(vi.getTimerCount()).toBe(0);
});

it("shows replacement reasons immediately with reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const view = render(<VnBox reasons={["First story."]} />);
  view.rerender(<VnBox reasons={["Another story."]} />);
  expect(view.container.querySelector(".vn-rest")).toBeEmptyDOMElement();
  expect(view.container.querySelector(".vn-box")).toHaveClass("is-done");
});
