import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleCover, useCoverTint } from "./coverColor";

let idleTasks: Array<() => void>;
let draw: ReturnType<typeof vi.fn>;
beforeEach(() => {
  idleTasks = [];
  draw = vi.fn();
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 220;
    pixels[i + 1] = 30;
    pixels[i + 2] = 40;
    pixels[i + 3] = 255;
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestIdleCallback", (task: () => void) => {
    idleTasks.push(task);
    return idleTasks.length;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const image = (url: string, decode = () => Promise.resolve()) => {
  const img = new Image();
  img.src = url;
  Object.defineProperties(img, {
    naturalWidth: { value: 100 },
    complete: { value: true },
    decode: { value: decode },
  });
  return img;
};
const flushIdle = async () => {
  await Promise.resolve();
  idleTasks.splice(0).forEach((task) => task());
};

it("does not cache a replacement image as the previous story's tint", async () => {
  const url = "/changed-cover.jpg";
  const img = image(url);
  const { result } = renderHook(() => useCoverTint(url));
  sampleCover(url, img);
  await Promise.resolve();
  img.src = "/replacement-cover.jpg";
  await act(flushIdle);
  expect(draw).not.toHaveBeenCalled();
  expect(result.current).toBeNull();
  // The stale idle task must not poison the cache or lose this subscriber.
  sampleCover(url, image(url));
  await act(flushIdle);
  expect(result.current).not.toBeNull();
});

it("samples after decoding, during idle time, and clears the previous tint on a new cover", async () => {
  const url = "/decoded-cover.jpg";
  let decoded!: () => void;
  const decoding = new Promise<void>((resolve) => (decoded = resolve));
  const { result, rerender } = renderHook(({ url }) => useCoverTint(url), {
    initialProps: { url },
  });
  sampleCover(
    url,
    image(url, () => decoding),
  );
  expect(idleTasks).toHaveLength(0);
  await act(async () => {
    decoded();
    await Promise.resolve();
  });
  expect(draw).not.toHaveBeenCalled();
  await act(flushIdle);
  expect(result.current).not.toBeNull();
  rerender({ url: "/unseen-cover.jpg" });
  expect(result.current).toBeNull();
});

it("resizes each cover once when several copies load together and releases the bitmap", async () => {
  const url = "/shared-bitmap-cover.jpg";
  const close = vi.fn();
  const bitmap = { close };
  let finish!: (value: ImageBitmap) => void;
  const resize = vi.fn(
    () => new Promise<ImageBitmap>((resolve) => (finish = resolve)),
  );
  vi.stubGlobal("createImageBitmap", resize);
  const { result } = renderHook(() => useCoverTint(url));
  sampleCover(url, image(url));
  sampleCover(url, image(url));
  await act(flushIdle);
  expect(resize).toHaveBeenCalledTimes(1);
  expect(draw).not.toHaveBeenCalled();
  await act(async () => finish(bitmap as unknown as ImageBitmap));
  expect(draw).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(result.current).not.toBeNull();
});

it("does not sample a reused image after a failed bitmap resize", async () => {
  const url = "/failed-resize-cover.jpg";
  const img = image(url);
  let fail!: (error: Error) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () => new Promise<ImageBitmap>((_resolve, reject) => (fail = reject)),
    ),
  );
  const { result } = renderHook(() => useCoverTint(url));
  sampleCover(url, img);
  await act(flushIdle);
  img.src = "/next-cover.jpg";
  await act(async () => fail(new Error("Resize unavailable")));
  expect(draw).not.toHaveBeenCalled();
  expect(result.current).toBeNull();
  // A canceled attempt leaves the cover available for another valid sample.
  vi.stubGlobal("createImageBitmap", undefined);
  sampleCover(url, image(url));
  await act(flushIdle);
  expect(result.current).not.toBeNull();
});

it("uses another loaded copy if the shared sampling attempt loses its source", async () => {
  const url = "/shared-retry-cover.jpg";
  const img = image(url);
  let fail!: (error: Error) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () => new Promise<ImageBitmap>((_resolve, reject) => (fail = reject)),
    ),
  );
  const { result } = renderHook(() => useCoverTint(url));
  sampleCover(url, img);
  sampleCover(url, image(url));
  sampleCover(url, img);
  await act(flushIdle);
  img.src = "/reused-cover.jpg";
  vi.stubGlobal("createImageBitmap", undefined);
  await act(async () => fail(new Error("Resize unavailable")));
  await act(flushIdle);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(result.current).not.toBeNull();
});
