import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";

const transitions = vi.hoisted(() => new Map<string, () => void>());
vi.mock("./components/Eyecatch", () => ({
  Eyecatch: ({ view, onCovered }: { view: string; onCovered: () => void }) => {
    transitions.set(view, onCovered);
    return null;
  },
}));
vi.mock("./lib/motion", async (original) => ({
  ...(await original<typeof import("./lib/motion")>()),
  prefersReducedMotion: () => false,
}));
beforeEach(() => {
  transitions.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(input).includes("preferences")
          ? {
              completed: true,
              tagPreferences: [],
              preferredLengths: [],
              preferredPlatforms: [],
            }
          : String(input).includes("/vndb/")
            ? {
                results: [],
                count: 0,
                page: 1,
                more: false,
                usableOnPage: 0,
                recordCount: 0,
              }
            : [],
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("ignores an older chapter callback after a newer navigation has finished", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Discover" }));
  const older = transitions.get("discover")!;
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  await act(async () => transitions.get("library")!());
  await screen.findByRole("heading", { name: "The stories you carry." });
  await act(async () => older());
  expect(
    screen.getByRole("heading", { name: "The stories you carry." }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Discover a story" }),
  ).not.toBeInTheDocument();
});
