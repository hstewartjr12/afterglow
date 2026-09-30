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
        if (options?.method === "DELETE") {
          library = library.filter(
            (e) => `/api/library/${e.vndbId}` !== url.pathname,
          );
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
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
  fireEvent.click(screen.getByRole("button", { name: "Discover" }));
  const card = await screen.findByRole("button", { name: /Alpha Story/ });
  card.focus();
  fireEvent.click(card);
  return screen.findByRole("dialog", { name: "Alpha Story" });
}

describe("discovery and library improvements", () => {
  it("paginates results, disables the last page, and resets pagination on filter changes", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    await screen.findByText("2 stories");
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(
      await screen.findByRole("heading", { name: "Beta Story" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Platform" }), {
      target: { value: "win" },
    });
    expect(
      await screen.findByRole("heading", { name: "Alpha Story" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    await screen.findByRole("heading", { name: "Beta Story" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search your library" }),
      { target: { value: "SUMMER" } },
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Beta Story" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(
      screen.getByRole("heading", { name: /Alpha Story/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Backlog 1" }));
    expect(
      screen.getByRole("heading", { name: "No stories match." }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("heading", { name: "Beta Story" }),
    ).toBeInTheDocument();
  });

  it("sorts rated stories before unrated stories without modifying cached data", async () => {
    library = [entry(alpha), entry(beta, { personalRating: 9 })];
    start();
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    await screen.findByRole("heading", { name: "Beta Story" });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
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
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Library unavailable",
    );
    expect(
      screen.queryByText("Your shelf is waiting."),
    ).not.toBeInTheDocument();
    failLibrary = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: "Discover stories" }),
    ).toBeInTheDocument();
  });

  it("shows preference load failures instead of a permanent loading skeleton", async () => {
    failPreferences = true;
    start();
    fireEvent.click(screen.getByRole("button", { name: "My taste" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profile unavailable",
    );
    failPreferences = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: "Save taste profile" }),
    ).toBeInTheDocument();
  });

  it("keeps unrated stories unrated, reports failed saves, and refreshes all matches after saving", async () => {
    const client = start();
    client.setQueryData(["recommendation", "v99"], {});
    client.setQueryData(["candidate-scores", "v99"], []);
    const dialog = await openStory();
    expect(within(dialog).getByText("Unrated")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Add to library" }),
      ).toBeEnabled(),
    );
    failSave = true;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add to library" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not save your story",
    );
    failSave = false;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add to library" }),
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
      within(dialog).getByRole("button", { name: "Add to library" }),
    );
    expect(document.documentElement.style.overflow).toBe("hidden");
    // Keep the page background paintable below Safari's floating controls.
    expect(document.body.style.overflow).toBe("");
    const opener = screen.getByRole("button", { name: /Alpha Story/ });
    const focus = vi.spyOn(opener, "focus");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
    // Restoring focus must not scroll a partly off-screen card into view.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("clears the profile saved message when the draft changes", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "My taste" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Save taste profile" }),
    );
    expect(
      await screen.findByRole("button", { name: "Profile saved" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Short" }));
    expect(
      screen.getByRole("button", { name: "Save taste profile" }),
    ).toBeInTheDocument();
  });
});

describe("unsaved taste changes", () => {
  it("warns before leaving the taste page with unsaved edits", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "My taste" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Short" }));
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Short" })).toBeChecked();
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(
      await screen.findByRole("heading", { name: "Discover a story" }),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("does not warn once the profile is saved", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "My taste" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Short" }));
    fireEvent.click(screen.getByRole("button", { name: "Save taste profile" }));
    await screen.findByRole("button", { name: "Profile saved" });
    expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("tracker edits", () => {
  it("rates on a 1–10 scale, toggles the chosen score off, and clears it", async () => {
    start();
    const dialog = await openStory();
    expect(within(dialog).getByText("Unrated")).toBeInTheDocument();
    const seven = within(dialog).getByRole("button", {
      name: "Rate 7 out of 10",
    });
    fireEvent.click(seven);
    expect(seven).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("7/10")).toBeInTheDocument();
    fireEvent.click(seven);
    expect(within(dialog).getByText("Unrated")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Rate 3 out of 10" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Clear rating" }),
    );
    expect(within(dialog).getByText("Unrated")).toBeInTheDocument();
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
      name: "Private notes",
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Add to library" }),
      ).toBeEnabled(),
    );
    fireEvent.change(notes, { target: { value: "First draft" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add to library" }),
    );
    await screen.findByRole("button", { name: "Adding…" });
    fireEvent.change(notes, { target: { value: "Second draft" } });
    expect(
      within(dialog).getByRole("button", { name: "Adding…" }),
    ).toBeDisabled();
    library = [entry(alpha, { notes: "First draft" })];
    finishSave(json(library[0]));
    // Once added, the entry is tracked and its remaining edit is still pending.
    await within(dialog).findByRole("button", { name: "Remove from library" });
    expect(notes).toHaveValue("Second draft");
    await waitFor(() =>
      expect(
        within(dialog).getByText(/Saving…|Unsaved changes/),
      ).toBeInTheDocument(),
    );
  });
});

describe("redesign behaviors", () => {
  const puts = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([url, options]) =>
          options?.method === "PUT" && String(url).startsWith("/api/library/"),
      )
      .map(([, options]) => JSON.parse(options!.body as string));

  it("autosaves tracker changes for stories already in the library", async () => {
    library = [entry(alpha)];
    start();
    const dialog = await openStory();
    await waitFor(() =>
      expect(within(dialog).getByText("All changes saved")).toBeInTheDocument(),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Rate 8 out of 10" }),
    );
    await waitFor(() => expect(puts().at(-1)?.personalRating).toBe(8), {
      timeout: 2000,
    });
    expect(
      within(dialog).queryByRole("button", { name: "Add to library" }),
    ).not.toBeInTheDocument();
  });

  it("offers undo after removing a story", async () => {
    library = [entry(alpha, { notes: "Keep me" })];
    start();
    const dialog = await openStory();
    await within(dialog).findByRole("button", { name: "Remove from library" });
    vi.mocked(fetch).mockClear();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from library" }),
    );
    const undo = await screen.findByRole("button", { name: "Undo" });
    expect(
      screen.getByText("Removed Alpha Story from your library"),
    ).toBeInTheDocument();
    fireEvent.click(undo);
    await waitFor(() => expect(puts().at(-1)?.notes).toBe("Keep me"));
  });

  it("shows active discovery filters as removable chips", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    const platform = await screen.findByRole("combobox", { name: "Platform" });
    fireEvent.change(platform, { target: { value: "swi" } });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove filter: Nintendo Switch",
      }),
    );
    expect(platform).toHaveValue("");
  });

  it("returns to the top of the page when changing pages", async () => {
    const scroll = vi.spyOn(window, "scrollTo");
    start();
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(scroll).toHaveBeenCalledWith(0, 0);
    scroll.mockRestore();
  });

  it("keeps synopsis spoilers hidden until revealed", async () => {
    const handler = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) =>
      String(input) === "/api/vndb/vn/v1"
        ? json({
            ...alpha,
            description:
              "Home again. [spoiler]The narrator was dead.[/spoiler] Then [spoiler]a second twist.[/spoiler]",
          })
        : handler(input, options),
    );
    start();
    const dialog = await openStory();
    await within(dialog).findByText("Home again.", { exact: false });
    expect(
      within(dialog).queryByText(/narrator was dead/),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("2 spoilers are hidden."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reveal spoiler 1 of 2" }),
    );
    expect(
      within(dialog).getByText("The narrator was dead."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("1 spoiler is hidden."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/second twist/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reveal all" }));
    expect(within(dialog).getByText("a second twist.")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Hide spoilers" }),
    );
    expect(
      within(dialog).queryByText(/narrator was dead/),
    ).not.toBeInTheDocument();
  });

  it("labels the spoiler tag control and explains hidden tags", async () => {
    start();
    const dialog = await openStory();
    const group = within(dialog).getByRole("group", { name: "Spoiler tags" });
    expect(within(group).getByRole("button", { name: "Hide" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).getByRole("button", { name: "All" })).toBeEnabled();
  });

  it("opens the tag index for the group whose Add tag was pressed", async () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "My taste" }));
    const addButtons = await screen.findAllByRole("button", {
      name: "Add tag",
    });
    fireEvent.click(addButtons[1]);
    const index = await screen.findByRole("dialog", { name: "VNDB tag index" });
    expect(within(index).getByText(/Adding to Like/)).toBeInTheDocument();
  });

  it("asks newcomers what they love and saves their picks", async () => {
    const handler = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (String(input).startsWith("/api/vndb/tags"))
        return json({
          results: [
            {
              id: "g7",
              name: "Nakige",
              aliases: [],
              description: "",
              category: "cont",
              searchable: true,
              applicable: true,
              vnCount: 10,
            },
          ],
          page: 1,
          more: false,
          recordCount: 1,
          usableOnPage: 1,
        });
      return handler(input, options);
    });
    start();
    expect(
      await screen.findByRole("heading", {
        name: "What do you love in a story?",
      }),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Nakige" }));
    fireEvent.click(screen.getByRole("button", { name: /Save 1 theme/ }));
    await waitFor(() =>
      expect(preferences.tagPreferences).toEqual([
        { id: "g7", name: "Nakige", weight: 3 },
      ]),
    );
    expect(preferences.completed).toBe(true);
  });
});
