import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { TagIndex } from "./TagIndex";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("cancels the superseded tag request and displays the new category", async () => {
  let firstSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (!url.searchParams.get("category")) {
        firstSignal = options?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          firstSignal?.addEventListener(
            "abort",
            () => reject(firstSignal?.reason),
            { once: true },
          );
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: "g1",
              name: "Mystery",
              aliases: [],
              description: "A mystery story",
              category: "cont",
              searchable: true,
              applicable: true,
              vnCount: 10,
            },
          ],
          recordCount: 1,
          usableOnPage: 1,
          page: 1,
          more: false,
        }),
      } as Response);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onPick = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TagIndex
        initialCategory=""
        selected={[{ id: "g1", name: "Mystery", weight: 1 }]}
        onClose={vi.fn()}
        onPick={onPick}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(firstSignal).toBeInstanceOf(AbortSignal));
  fireEvent.click(screen.getByRole("button", { name: "Content" }));
  expect(
    await screen.findByRole("heading", { name: "Mystery" }),
  ).toBeInTheDocument();
  expect(firstSignal?.aborted).toBe(true);
  const like = screen.getByRole("button", { name: "Like" });
  expect(like).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(like);
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }), 1);
});
