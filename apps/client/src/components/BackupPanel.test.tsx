import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  preferencesSchema,
  MAX_BACKUP_BYTES,
  type Backup,
  type LibraryEntry,
  type VnSummary,
} from "@afterglow/shared";
import { api } from "../api";
import { BackupPanel, readBackupFile } from "./BackupPanel";
import { Taste } from "../views/Taste";

vi.mock("../api", () => ({
  api: {
    library: vi.fn(),
    feedback: vi.fn(),
    backup: vi.fn(),
    importBackup: vi.fn(),
    preferences: vi.fn(),
  },
}));
const date = "2026-01-01T00:00:00.000Z";
const vn = (id: string): VnSummary => ({
  id,
  title: `Story ${id}`,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: "2025",
  rating: 80,
  voteCount: 20,
  length: 2,
  platforms: [],
  tags: [],
});
const entry = (id: string): LibraryEntry => ({
  id: Number(id.slice(1)),
  vndbId: id,
  vn: vn(id),
  status: "backlog",
  personalRating: null,
  favorite: false,
  progress: 0,
  notes: "Private notes",
  startedAt: null,
  completedAt: null,
  createdAt: date,
  updatedAt: date,
});
const backup = (): Backup => ({
  kind: "afterglow-backup",
  version: 1,
  exportedAt: date,
  library: [entry("v1"), entry("v2")],
  preferences: preferencesSchema.parse({}),
  feedback: [],
});
beforeEach(() => {
  vi.mocked(api.library).mockResolvedValue([entry("v1")]);
  vi.mocked(api.feedback).mockResolvedValue([]);
  vi.mocked(api.backup).mockResolvedValue(backup());
  vi.mocked(api.importBackup).mockResolvedValue({
    added: 1,
    updated: 0,
    kept: 1,
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function start() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["recommendations"], []);
  client.setQueryData(["recommendation", "v99"], {});
  client.setQueryData(["candidate-scores", "v99"], []);
  render(
    <QueryClientProvider client={client}>
      <BackupPanel />
    </QueryClientProvider>,
  );
  return client;
}
function file(value: unknown, name = "restore.json") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const chosen = new File([text], name, { type: "application/json" });
  Object.defineProperty(chosen, "text", { value: vi.fn(async () => text) });
  return chosen;
}
async function choose(value: unknown) {
  fireEvent.change(screen.getByLabelText("Choose an Afterglow backup"), {
    target: { files: [file(value)] },
  });
  return screen.findByRole("button", { name: "Restore backup" });
}

describe("backup file validation", () => {
  it("rejects malformed and incomplete files before any restore call", async () => {
    start();
    fireEvent.change(screen.getByLabelText("Choose an Afterglow backup"), {
      target: { files: [file("broken JSON")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No data was changed",
    );
    expect(
      screen.queryByRole("button", { name: "Restore backup" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose an Afterglow backup"), {
      target: { files: [file({ ...backup(), preferences: {} })] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("not a complete"),
    );
    expect(api.importBackup).not.toHaveBeenCalled();
  });
  it("checks file size before reading and accepts backups without optional feedback", async () => {
    const oversized = file(backup());
    Object.defineProperty(oversized, "size", { value: MAX_BACKUP_BYTES + 1 });
    await expect(readBackupFile(oversized)).rejects.toThrow(
      "smaller than 10 MB",
    );
    expect(oversized.text).not.toHaveBeenCalled();
    const older = { ...backup(), feedback: undefined };
    expect((await readBackupFile(file(older))).feedback).toEqual([]);
  });
});

describe("backup preview and restore", () => {
  it("previews conflicts, keeps both overwrite options off, and refreshes dependent data after restoring", async () => {
    const client = start();
    const restore = await choose(backup());
    await waitFor(() => expect(restore).toBeEnabled());
    expect(
      screen.getByText(/1 new · 1 already in your library/),
    ).toBeInTheDocument();
    screen
      .getAllByRole("checkbox")
      .forEach((checkbox) => expect(checkbox).not.toBeChecked());
    fireEvent.click(restore);
    expect(await screen.findByText(/Backup restored/)).toHaveTextContent(
      "1 added · 0 replaced · 1 kept",
    );
    expect(api.importBackup).toHaveBeenCalledWith(
      { backup: backup(), overwrite: false, includePreferences: false },
      expect.anything(),
    );
    expect(client.getQueryState(["recommendations"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["recommendation", "v99"])?.isInvalidated).toBe(
      true,
    );
    expect(
      client.getQueryState(["candidate-scores", "v99"])?.isInvalidated,
    ).toBe(true);
  });
  it("sends overwrite and profile restoration only when explicitly selected", async () => {
    start();
    const restore = await choose(backup());
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Replace matching stories/ }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Restore the backup’s taste profile/,
      }),
    );
    fireEvent.click(restore);
    expect(await screen.findByText(/Backup restored/)).toHaveTextContent(
      "Taste profile restored",
    );
    expect(api.importBackup).toHaveBeenCalledWith(
      { backup: backup(), overwrite: true, includePreferences: true },
      expect.anything(),
    );
  });
  it("shows the restored taste draft immediately when its fresh request is still pending", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    client.setQueryData(
      ["preferences"],
      preferencesSchema.parse({ preferredLengths: [2] }),
    );
    const incoming = backup();
    incoming.preferences.preferredLengths = [4];
    // Simulate navigation before the restored profile's refetch can finish.
    vi.mocked(api.preferences).mockImplementation(() => new Promise(() => {}));
    const view = render(
      <QueryClientProvider client={client}>
        <BackupPanel />
      </QueryClientProvider>,
    );
    const restore = await choose(incoming);
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Restore the backup’s taste profile/,
      }),
    );
    fireEvent.click(restore);
    await screen.findByText(/Backup restored/);
    view.rerender(
      <QueryClientProvider client={client}>
        <Taste />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("checkbox", { name: "Long" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Short" })).not.toBeChecked();
  });
  it("keeps the preview available after a failed restore", async () => {
    vi.mocked(api.importBackup).mockRejectedValue(
      new Error("Restore failed. No data was changed."),
    );
    const client = start();
    const restore = await choose(backup());
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Restore failed",
    );
    expect(screen.getByText("restore.json")).toBeInTheDocument();
    expect(client.getQueryData<LibraryEntry[]>(["library"])?.[0].notes).toBe(
      "Private notes",
    );
    expect(client.getQueryState(["recommendations"])?.isInvalidated).toBe(
      false,
    );
  });
  it("downloads a fresh JSON backup with a dated filename", async () => {
    const OriginalURL = URL;
    const createObjectURL = vi.fn((_blob: Blob) => "blob:backup");
    vi.stubGlobal(
      "URL",
      Object.assign(class extends OriginalURL {}, {
        createObjectURL,
        revokeObjectURL: vi.fn(),
      }),
    );
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download;
    });
    start();
    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByText("Backup downloaded.")).toBeInTheDocument();
    expect(api.backup).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(createObjectURL.mock.calls[0][0].type).toBe("application/json");
    expect(filename).toBe("afterglow-backup-2026-01-01.json");
  });
});
