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
import type { LibraryEntry, LibraryInput, VnDetail } from "@afterglow/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const story: VnDetail = {
  id: "v1",
  title: "A Story to Keep",
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
  description: "A quiet story.",
};
const json = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 502, json: async () => body }) as Response;
let library: LibraryEntry[];
let blockLibraryRefetch: boolean;
let finishSave: ((response: Response) => void) | undefined;
let saving: LibraryInput | undefined;
let releaseLibrary: (() => void)[];

beforeEach(() => {
  history.replaceState(null, "", "/?view=discover");
  library = [
    {
      id: 1,
      vndbId: story.id,
      vn: story,
      status: "backlog",
      personalRating: null,
      favorite: false,
      progress: 0,
      notes: "Original note",
      startedAt: null,
      completedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  blockLibraryRefetch = false;
  finishSave = undefined;
  saving = undefined;
  releaseLibrary = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/library") {
        if (blockLibraryRefetch)
          await new Promise<void>((resolve) => releaseLibrary.push(resolve));
        return json(library);
      }
      if (url.pathname === "/api/library/v1") {
        saving = JSON.parse(options!.body as string);
        return new Promise<Response>((resolve) => {
          finishSave = resolve;
        });
      }
      if (url.pathname === "/api/preferences")
        return json({
          completed: true,
          tagPreferences: [],
          preferredLengths: [],
          preferredPlatforms: [],
          useSpoilerTagsInRecommendations: false,
        });
      if (url.pathname === "/api/vndb/search")
        return json({ results: [story], count: 1, more: false });
      if (url.pathname === "/api/vndb/vn/v1") return json(story);
      if (url.pathname === "/api/recommendations/v1")
        return json({ vn: story, score: 60, matchPercent: 60, reasons: [] });
      return json([]);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => releaseLibrary.forEach((release) => release()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openStory() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, staleTime: Infinity },
            mutations: { retry: false },
          },
        })
      }
    >
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /^A Story to Keep/ }),
  );
  const dialog = await screen.findByRole("dialog", { name: story.title });
  const notes = within(dialog).getByRole("textbox", { name: "Private notes" });
  await waitFor(() => expect(notes).toHaveValue("Original note"));
  return { dialog, notes };
}
const closeButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "Close details" });
const storyIdInUrl = () => new URLSearchParams(location.search).get("vn");
async function succeedSave() {
  await waitFor(() => expect(finishSave).toBeDefined());
  library = [
    { ...library[0], ...saving!, updatedAt: "2026-10-04T12:00:00.000Z" },
  ];
  await act(async () => finishSave!(json(library[0])));
}
async function failSave() {
  await waitFor(() => expect(finishSave).toBeDefined());
  await act(async () =>
    finishSave!(json({ error: "Could not save your story" }, false)),
  );
}
async function expectClosed() {
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(storyIdInUrl()).toBeNull();
}

describe("leaving tracker changes safely", () => {
  it("waits for close-triggered saves and shows the fresh notes when revisited before refetch completes", async () => {
    const { dialog, notes } = await openStory();
    const confirm = vi.spyOn(window, "confirm");
    fireEvent.change(notes, { target: { value: "The note I saved" } });
    blockLibraryRefetch = true;
    fireEvent.click(closeButton(dialog));
    await waitFor(() => expect(saving?.notes).toBe("The note I saved"));
    expect(dialog).toBeInTheDocument();
    expect(notes).toHaveValue("The note I saved");
    expect(storyIdInUrl()).toBe("v1");
    expect(confirm).not.toHaveBeenCalled();

    await succeedSave();
    await expectClosed();
    // The mutation response should update the cache immediately. Waiting for the
    // still-pending GET here would re-open an old form and risk erasing the note.
    await act(async () => history.forward());
    const revisited = await screen.findByRole("dialog", { name: story.title });
    await waitFor(() =>
      expect(
        within(revisited).getByRole("textbox", { name: "Private notes" }),
      ).toHaveValue("The note I saved"),
    );
    expect(library[0].notes).toBe("The note I saved");
  });

  it("keeps later edits through a pending close and leaves only after the latest draft saves", async () => {
    const { dialog, notes } = await openStory();
    fireEvent.change(notes, { target: { value: "First draft" } });
    fireEvent.click(closeButton(dialog));
    await waitFor(() => expect(saving?.notes).toBe("First draft"));
    fireEvent.change(notes, { target: { value: "Latest draft" } });
    await succeedSave();
    expect(dialog).toBeInTheDocument();
    expect(notes).toHaveValue("Latest draft");
    expect(library[0].notes).toBe("First draft");
    await waitFor(() => expect(saving?.notes).toBe("Latest draft"), {
      timeout: 2000,
    });
    expect(dialog).toBeInTheDocument();
    await succeedSave();
    await expectClosed();
    expect(library[0].notes).toBe("Latest draft");
  });

  it("keeps failed close saves editable until the user explicitly accepts discarding them", async () => {
    const { dialog, notes } = await openStory();
    fireEvent.change(notes, { target: { value: "Do not lose this draft" } });
    fireEvent.click(closeButton(dialog));
    await failSave();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not save your story",
    );
    expect(notes).toHaveValue("Do not lose this draft");
    expect(storyIdInUrl()).toBe("v1");
    expect(library[0].notes).toBe("Original note");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(closeButton(dialog));
    expect(confirm).toHaveBeenCalledWith(
      "Your changes for A Story to Keep could not be saved. Discard them and leave?",
    );
    expect(dialog).toBeInTheDocument();
    expect(notes).toHaveValue("Do not lose this draft");
    confirm.mockReturnValueOnce(true);
    fireEvent.click(closeButton(dialog));
    await expectClosed();
  });

  it("rolls Back forward while a save is pending and retries Back after success", async () => {
    const { dialog, notes } = await openStory();
    fireEvent.change(notes, { target: { value: "Save before going back" } });
    await act(async () => history.back());
    await waitFor(() => expect(saving?.notes).toBe("Save before going back"));
    await waitFor(() => expect(storyIdInUrl()).toBe("v1"));
    expect(dialog).toBeInTheDocument();
    expect(notes).toHaveValue("Save before going back");
    await succeedSave();
    await expectClosed();
    expect(library[0].notes).toBe("Save before going back");
  });

  it("restores the story URL and draft after a Back-triggered save fails, then honors discard confirmation", async () => {
    const { dialog, notes } = await openStory();
    fireEvent.change(notes, { target: { value: "Keep this failed draft" } });
    await act(async () => history.back());
    await waitFor(() => expect(storyIdInUrl()).toBe("v1"));
    await failSave();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not save your story",
    );
    expect(dialog).toBeInTheDocument();
    expect(notes).toHaveValue("Keep this failed draft");
    expect(library[0].notes).toBe("Original note");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await act(async () => history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storyIdInUrl()).toBe("v1"));
    expect(notes).toHaveValue("Keep this failed draft");
    confirm.mockReturnValueOnce(true);
    await act(async () => history.back());
    await expectClosed();
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
