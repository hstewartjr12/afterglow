import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VnSummary } from "@afterglow/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Card } from "./Card";

const vn: VnSummary = {
  id: "v1",
  title: "A story",
  alttitle: null,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: null,
  rating: 0,
  voteCount: 0,
  length: null,
  platforms: [],
  tags: [],
};
let tasks: Map<number, FrameRequestCallback>;
let media: MediaQueryList;
beforeEach(() => {
  tasks = new Map();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (task: FrameRequestCallback) => {
    tasks.set(++id, task);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => tasks.delete(id));
  media = Object.assign(new EventTarget(), {
    matches: false,
  }) as MediaQueryList;
  vi.stubGlobal("matchMedia", () => media);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function start() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(["library"], []);
  const view = render(
    <QueryClientProvider client={client}>
      <LazyMotion features={domMax} strict>
        <Card vn={vn} onOpen={() => {}} />
      </LazyMotion>
    </QueryClientProvider>,
  );
  const card = screen
    .getByRole("button", { name: vn.title })
    .closest("article")!;
  const measure = vi
    .spyOn(card.querySelector(".cover")!, "getBoundingClientRect")
    .mockReturnValue({ left: 0, top: 0, width: 100, height: 150 } as DOMRect);
  return { ...view, card, measure };
}
function move(card: HTMLElement, x: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", {
    bubbles: true,
    clientX: x,
    clientY: 75,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(card, event);
}
function frame() {
  act(() => {
    const pending = [...tasks.entries()];
    tasks.clear();
    for (const [, task] of pending) task(performance.now());
  });
}

it("measures once per frame and paints the latest pointer position", () => {
  const { card, measure } = start();
  move(card, 20);
  move(card, 80);
  expect(measure).not.toHaveBeenCalled();
  frame();
  expect(measure).toHaveBeenCalledTimes(1);
  expect(card.style.getPropertyValue("--mx")).toBe("80%");
  move(card, 50);
  fireEvent.pointerLeave(card);
  frame();
  expect(measure).toHaveBeenCalledTimes(1);
  expect(card.style.getPropertyValue("--mx")).toBe("");
});

it("cancels queued work on unmount and ignores touch input", () => {
  const { card, measure, unmount } = start();
  move(card, 20, "touch");
  frame();
  expect(measure).not.toHaveBeenCalled();
  move(card, 80);
  unmount();
  frame();
  expect(measure).not.toHaveBeenCalled();
});

it("clears tilt and cancels pending work when reduced motion turns on", () => {
  const { card, measure } = start();
  move(card, 80);
  frame();
  move(card, 20);
  act(() => {
    Object.defineProperty(media, "matches", { value: true });
    media.dispatchEvent(new Event("change"));
  });
  frame();
  move(card, 30);
  frame();
  expect(measure).toHaveBeenCalledTimes(1);
  expect(card.style.getPropertyValue("--mx")).toBe("");
});
