import { afterEach, expect, it, vi } from "vitest";
import { requestJson } from "./request";
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("times out a stalled response body and aborts its network request", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    signal = options!.signal!;
    return {
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    } as Response;
  });
  const pending = requestJson("/api/vndb/search");
  const result = expect(pending).rejects.toThrow("Loading took too long");
  await vi.advanceTimersByTimeAsync(20_000);
  await result;
  expect(signal!.aborted).toBe(true);
});
it("preserves cancellation when a new search replaces the old one", async () => {
  const controller = new AbortController();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  const pending = requestJson("/api/vndb/search", {
    signal: controller.signal,
  });
  const result = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await result;
});
