import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Motes } from "./Motes";

let intersect: (entries: Array<{ isIntersecting: boolean }>) => void;
let resize: () => void;
let hidden: boolean;
let width: number;
let height: number;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  hidden = false;
  width = 100;
  height = 60;
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "clientWidth",
    "get",
  ).mockImplementation(() => width);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "clientHeight",
    "get",
  ).mockImplementation(() => height);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
    frames.delete(frame),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("pauses in a hidden document and resumes even if intersection changed while hidden", () => {
  const view = render(<Motes count={0} />);
  act(() => intersect([{ isIntersecting: true }]));
  expect(frames.size).toBe(1);
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(frames.size).toBe(0);
  act(() => {
    intersect([{ isIntersecting: false }]);
    intersect([{ isIntersecting: true }]);
  });
  expect(frames.size).toBe(0);
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(frames.size).toBe(1);
  view.unmount();
  expect(frames.size).toBe(0);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(frames.size).toBe(0);
});

it("resizes with its container without resetting an unchanged bitmap", () => {
  vi.stubGlobal("devicePixelRatio", 1);
  const setWidth = vi.spyOn(HTMLCanvasElement.prototype, "width", "set");
  const setHeight = vi.spyOn(HTMLCanvasElement.prototype, "height", "set");
  const view = render(<Motes count={0} />);
  const canvas = view.container.querySelector("canvas")!;
  expect(canvas.width).toBe(100);
  expect(canvas.height).toBe(60);
  setWidth.mockClear();
  setHeight.mockClear();
  act(() => resize());
  act(() => window.dispatchEvent(new Event("resize")));
  expect(setWidth).not.toHaveBeenCalled();
  expect(setHeight).not.toHaveBeenCalled();
  act(() => {
    height = 120;
    resize();
  });
  expect(canvas.height).toBe(120);
  expect(setWidth).not.toHaveBeenCalled();
  expect(setHeight).toHaveBeenCalledTimes(1);
});
