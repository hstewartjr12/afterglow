import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry, Preferences, VnDetail } from "@afterglow/shared";
import App from "./App";

const story = (id: string, title: string): VnDetail => ({
  id,
  title,
  alttitle: null,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: "2024-01-01",
  rating: 80,
  voteCount: 100,
  length: 2,
  platforms: ["win"],
  tags: [],
  aliases: [],
  description: "A story about finding your way home.",
});
const alpha = story("v1", "Alpha Story");
const beta = story("v2", "Beta Story");
const entry = (
  vn: VnDetail,
  overrides: Partial<LibraryEntry> = {},
): LibraryEntry => ({
  id: Number(vn.id.slice(1)),
  vndbId: vn.id,
  vn,
  status: "backlog",
  personalRating: null,
  favorite: false,
  progress: 0,
  notes: "",
  startedAt: null,
  completedAt: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});
let library: LibraryEntry[];
let preferences: Preferences;
let failLibrary: boolean;
let failSave: boolean;
let failPreferences: boolean;
const json = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 502, json: async () => body }) as Response;

beforeEach(() => {
  library = [];
  preferences = {
    tagPreferences: [],
    preferredLengths: [],
    preferredPlatforms: [],
    completed: false,
    useSpoilerTagsInRecommendations: false,
  };
  failLibrary = false;
  failSave = false;
  failPreferences = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/library")
        return json(
          failLibrary ? { error: "Library unavailable" } : library,
          !failLibrary,
        );
      if (url.pathname.startsWith("/api/library/")) {
        if (failSave)
          return json({ error: "Could not save your story" }, false);
        const saved = entry(alpha, JSON.parse(options!.body as string));
        library = [saved];
        return json(saved);
      }
      if (url.pathname === "/api/preferences") {
        if (failPreferences)
          return json({ error: "Profile unavailable" }, false);
        if (options?.method === "PUT")
          preferences = JSON.parse(options.body as string);
        return json(preferences);
      }
      if (url.pathname === "/api/vndb/search")
        return json({
          results: [url.searchParams.get("page") === "2" ? beta : alpha],
          count: 2,
          more: url.searchParams.get("page") !== "2",
        });
      if (url.pathname === "/api/vndb/vn/v1") return json(alpha);
      if (url.pathname === "/api/recommendations/v1")
        return json({
          vn: alpha,
          matchPercent: 60,
          score: 60,
          reasons: ["A promising story"],
        });
      if (url.pathname === "/api/vndb/tags")
        return json({
          results: [],
          page: 1,
          more: false,
          recordCount: 0,
          usableOnPage: 0,
        });
      return json([]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function start() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  return client;
}
async function openStory() {
  fireEvent.click(screen.getByRole("button", { name: "DISCOVER" }));
  const card = await screen.findByRole("button", { name: /Alpha Story/ });
  card.focus();
  fireEvent.click(card);
  return screen.findByRole("dialog", { name: "Alpha Story" });
}

describe("discovery and library improvements", () => {
  it("paginates results, disables the last page, and resets pagination on filter changes", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "DISCOVER" }));
    await screen.findByText("SHOWING: 1 OF 2");
    fireEvent.click(screen.getByRole("button", { name: "NEXT →" }));
    expect(
      await screen.findByRole("heading", { name: "Beta Story" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NEXT →" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "PLATFORM" }), {
      target: { value: "win" },
    });
    expect(
      await screen.findByRole("heading", { name: "Alpha Story" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PAGE 1")).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, options]) =>
            String(url).includes("page=1") &&
            String(url).includes("platform=win") &&
            options?.signal instanceof AbortSignal,
        ),
    ).toBe(true);
  });

  it("combines library search, favorites and status filters, then clears an empty result", async () => {
    library = [
      entry(alpha, {
        favorite: true,
        status: "completed",
        notes: "A quiet summer",
      }),
      entry(beta),
    ];
    start();
    fireEvent.click(screen.getByRole("button", { name: "LIBRARY" }));
    await screen.findByRole("heading", { name: "Beta Story" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search your library" }),
      { target: { value: "SUMMER" } },
    );
    expect(
      screen.queryByRole("heading", { name: "Beta Story" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "FAVORITES" }));
    expect(
      screen.getByRole("heading", { name: /Alpha Story/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "BACKLOG 1" }));
    expect(
      screen.getByRole("heading", { name: "NO STORIES MATCH." }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CLEAR FILTERS" }));
    expect(
      screen.getByRole("heading", { name: "Beta Story" }),
    ).toBeInTheDocument();
  });

  it("sorts rated stories before unrated stories without modifying cached data", async () => {
    library = [entry(alpha), entry(beta, { personalRating: 9 })];
    start();
    fireEvent.click(screen.getByRole("button", { name: "LIBRARY" }));
    await screen.findByRole("heading", { name: "Beta Story" });
    fireEvent.change(screen.getByRole("combobox", { name: "SORT BY" }), {
      target: { value: "rating" },
    });
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((el) => el.textContent?.trim()),
    ).toEqual(["Beta Story", "Alpha Story"]);
    expect(library[0].vn.title).toBe("Alpha Story");
  });

  it("shows library failures with a working retry instead of an empty shelf", async () => {
    failLibrary = true;
    start();
    fireEvent.click(screen.getByRole("button", { name: "LIBRARY" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Library unavailable",
    );
    expect(
      screen.queryByText("YOUR SHELF IS WAITING."),
    ).not.toBeInTheDocument();
    failLibrary = false;
    fireEvent.click(screen.getByRole("button", { name: "TRY AGAIN" }));
    expect(
      await screen.findByRole("button", { name: "DISCOVER STORIES" }),
    ).toBeInTheDocument();
  });

  it("shows preference load failures instead of a permanent loading skeleton", async () => {
    failPreferences = true;
    start();
    fireEvent.click(screen.getByRole("button", { name: "MY TASTE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profile unavailable",
    );
    failPreferences = false;
    fireEvent.click(screen.getByRole("button", { name: "TRY AGAIN" }));
    expect(
      await screen.findByRole("button", { name: "SAVE TASTE PROFILE" }),
    ).toBeInTheDocument();
  });

  it("keeps unrated stories unrated, reports failed saves, and refreshes all matches after saving", async () => {
    const client = start();
    client.setQueryData(["recommendation", "v99"], {});
    client.setQueryData(["candidate-scores", "v99"], []);
    const dialog = await openStory();
    expect(within(dialog).getByText("UNRATED")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "SAVE TO LIBRARY" }),
      ).toBeEnabled(),
    );
    failSave = true;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "SAVE TO LIBRARY" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not save your story",
    );
    failSave = false;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "SAVE TO LIBRARY" }),
    );
    await waitFor(() => expect(library).toHaveLength(1));
    expect(library[0].personalRating).toBeNull();
    await waitFor(() =>
      expect(
        client.getQueryState(["candidate-scores", "v99"])?.isInvalidated,
      ).toBe(true),
    );
    expect(client.getQueryState(["recommendation", "v99"])?.isInvalidated).toBe(
      true,
    );
  });

  it("traps dialog focus, closes on Escape and restores the opener", async () => {
    start();
    const dialog = await openStory();
    const close = within(dialog).getByRole("button", { name: "Close details" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "SAVE TO LIBRARY" }),
    );
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Alpha Story/ })).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("clears the profile saved message when the draft changes", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "MY TASTE" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "SAVE TASTE PROFILE" }),
    );
    expect(
      await screen.findByRole("button", { name: "PROFILE SAVED" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Short" }));
    expect(
      screen.getByRole("button", { name: "SAVE TASTE PROFILE" }),
    ).toBeInTheDocument();
  });
});

describe("tracker edits", () => {
  it("lets readers assign the default midrange rating and clear it again", async () => {
    start();
    const dialog = await openStory();
    const rating = within(dialog).getByRole("slider", { name: /YOUR RATING/ });
    expect(rating).toHaveValue("0");
    expect(rating).toHaveAttribute("aria-valuetext", "Unrated");
    fireEvent.change(rating, { target: { value: "7" } });
    expect(rating).toHaveAttribute("aria-valuetext", "7 out of 10");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "CLEAR RATING" }),
    );
    expect(rating).toHaveValue("0");
    expect(within(dialog).getByText("UNRATED")).toBeInTheDocument();
  });

  it("preserves notes edited while a save is in flight", async () => {
    let finishSave: (response: Response) => void = () => {};
    const handler = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, options) => {
      if (
        options?.method === "PUT" &&
        String(input).startsWith("/api/library/")
      ) {
        return new Promise<Response>((resolve) => {
          finishSave = resolve;
        });
      }
      return handler(input, options);
    });
    start();
    const dialog = await openStory();
    const notes = within(dialog).getByRole("textbox", {
      name: "PRIVATE NOTES",
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "SAVE TO LIBRARY" }),
      ).toBeEnabled(),
    );
    fireEvent.change(notes, { target: { value: "First draft" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "SAVE TO LIBRARY" }),
    );
    await screen.findByRole("button", { name: "SAVING…" });
    fireEvent.change(notes, { target: { value: "Second draft" } });
    expect(
      within(dialog).getByRole("button", { name: "SAVING…" }),
    ).toBeDisabled();
    library = [entry(alpha, { notes: "First draft" })];
    finishSave(json(library[0]));
    await within(dialog).findByRole("button", { name: "SAVE TO LIBRARY" });
    expect(notes).toHaveValue("Second draft");
    expect(
      within(dialog).queryByRole("button", { name: "SAVED" }),
    ).not.toBeInTheDocument();
  });
});
