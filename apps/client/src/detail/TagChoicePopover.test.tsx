import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TagChoicePopover } from "./TagChoicePopover";

const tag = { id: "g1", name: "Mystery", rating: 3, spoiler: 0 };
const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }) as DOMRect;
let anchor: HTMLButtonElement;
let anchorRect: DOMRect;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;

beforeEach(() => {
  anchorRect = rect(600, 100, 80, 30);
  const list = document.createElement("div");
  const row = document.createElement("div");
  row.className = "detail-tag";
  anchor = document.createElement("button");
  row.append(anchor);
  list.append(row);
  document.body.append(list);
  vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(
    () => anchorRect,
  );
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
    rect(0, 50, 900, 400),
  );
  const originalRect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return this.classList.contains("tag-popover")
        ? rect(0, 0, 260, 220)
        : originalRect.call(this);
    },
  );
  frames = new Map();
  frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flushFrame = () =>
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  });
const popover = (onClose = vi.fn()) => (
  <TagChoicePopover
    anchor={anchor}
    tag={tag}
    pending={false}
    onChoose={vi.fn()}
    onClose={onClose}
  />
);

describe("tag choice positioning", () => {
  it("positions immediately, then follows rapid scrolling once per frame", () => {
    render(popover());
    const panel = screen.getByRole("group", { name: "Tune Mystery" });
    expect(panel).toHaveStyle({
      left: "420px",
      top: "136px",
      visibility: "visible",
    });
    flushFrame();
    const measurements = vi.mocked(anchor.getBoundingClientRect);
    measurements.mockClear();
    anchorRect = rect(500, 200, 80, 30);
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    fireEvent.resize(window);
    expect(measurements).not.toHaveBeenCalled();
    flushFrame();
    expect(measurements).toHaveBeenCalledTimes(1);
    expect(panel).toHaveStyle({ left: "320px", top: "236px" });
  });

  it("keeps the popover aligned after parent content moves the anchor", () => {
    const view = render(popover());
    flushFrame();
    anchorRect = rect(500, 200, 80, 30);
    view.rerender(popover());
    flushFrame();
    expect(screen.getByRole("group", { name: "Tune Mystery" })).toHaveStyle({
      left: "320px",
      top: "236px",
    });
  });

  it("closes through the latest callback when the tag leaves its scrolling list", () => {
    const previousClose = vi.fn();
    const latestClose = vi.fn();
    const view = render(popover(previousClose));
    flushFrame();
    view.rerender(popover(latestClose));
    anchorRect = rect(500, 500, 80, 30);
    fireEvent.scroll(window);
    flushFrame();
    expect(latestClose).toHaveBeenCalledTimes(1);
    expect(previousClose).not.toHaveBeenCalled();
  });

  it("cancels a queued positioning update when closed", () => {
    const view = render(popover());
    flushFrame();
    const measurements = vi.mocked(anchor.getBoundingClientRect);
    measurements.mockClear();
    fireEvent.scroll(window);
    view.unmount();
    flushFrame();
    expect(measurements).not.toHaveBeenCalled();
    fireEvent.scroll(window);
    flushFrame();
    expect(measurements).not.toHaveBeenCalled();
  });
});
