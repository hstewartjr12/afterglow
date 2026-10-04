import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const vn = {
  id: "v17",
  title: "History Story",
  alttitle: null,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: "2024-01-01",
  rating: 80,
  voteCount: 500,
  length: 2,
  platforms: ["win"],
  tags: [],
  aliases: [],
  description: "A quiet story.",
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const body =
        url.pathname === "/api/preferences"
          ? {
              completed: true,
              tagPreferences: [],
              preferredLengths: [],
              preferredPlatforms: [],
              useSpoilerTagsInRecommendations: false,
            }
          : url.pathname === "/api/vndb/vn/v17"
            ? vn
            : url.pathname === "/api/vndb/search"
              ? { results: [vn], count: 90, more: true }
              : url.pathname === "/api/recommendations/v17"
                ? { vn, score: 60, matchPercent: 60, reasons: [] }
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const start = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        })
      }
    >
      <App />
    </QueryClientProvider>,
  );

describe("browser navigation", () => {
  it("opens a shared story on load and closes it without losing its search", async () => {
    history.replaceState(null, "", "/?view=discover&language=en&page=2&vn=v17");
    start();
    const dialog = await screen.findByRole("dialog", { name: vn.title });
    expect(
      await screen.findByRole("combobox", { name: "Language" }),
    ).toHaveValue("en");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close details" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(new URLSearchParams(location.search).get("vn")).toBeNull();
    expect(new URLSearchParams(location.search).get("page")).toBe("2");
  });
  it("keeps browsing filters across views and uses Back/Forward for details", async () => {
    history.replaceState(null, "", "/?view=discover&language=en&page=2");
    start();
    await screen.findByRole("heading", { name: "Discover a story" });
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    await screen.findByRole("heading", { name: "The stories you carry." });
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(
      await screen.findByRole("combobox", { name: "Language" }),
    ).toHaveValue("en");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: /^History Story/ }),
    );
    await screen.findByRole("dialog", { name: vn.title });
    await act(async () => history.back());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(new URLSearchParams(location.search).get("language")).toBe("en");
    await act(async () => history.forward());
    expect(
      await screen.findByRole("dialog", { name: vn.title }),
    ).toBeInTheDocument();
  });
  it("cancels browser Back when new tracker edits would be discarded", async () => {
    history.replaceState(null, "", "/?view=discover");
    start();
    fireEvent.click(
      await screen.findByRole("button", { name: /^History Story/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: vn.title });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: /Private notes/ }),
      { target: { value: "Keep my note" } },
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await waitFor(() =>
      expect(new URLSearchParams(location.search).get("vn")).toBe("v17"),
    );
    expect(
      within(dialog).getByRole("textbox", { name: /Private notes/ }),
    ).toHaveValue("Keep my note");
  });
});
