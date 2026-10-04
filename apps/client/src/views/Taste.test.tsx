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
import { LazyMotion, domMax } from "motion/react";
import type { Preferences } from "@afterglow/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ToastProvider } from "../components/Toasts";
import { Taste } from "./Taste";

vi.mock("../api", () => ({
  api: {
    preferences: vi.fn(),
    savePreferences: vi.fn(),
    feedback: vi.fn(),
    saveFeedback: vi.fn(),
    removeFeedback: vi.fn(),
  },
}));

const restoredProfile: Preferences = {
  completed: true,
  tagPreferences: [
    { id: "g1", name: "Restored strong preference", weight: 2 },
    { id: "g2", name: "Restored mild preference", weight: 0.5 },
    { id: "g3", name: "Restored avoided theme", weight: -1 },
    { id: "g4", name: "Neutral theme", weight: 0 },
  ],
  preferredLengths: [],
  preferredPlatforms: ["win"],
  useSpoilerTagsInRecommendations: false,
};

beforeEach(() => {
  vi.mocked(api.preferences).mockResolvedValue(restoredProfile);
  vi.mocked(api.savePreferences).mockImplementation(async (profile) => {
    vi.mocked(api.preferences).mockResolvedValue(profile);
    return profile;
  });
  vi.mocked(api.feedback).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
      <LazyMotion features={domMax} strict>
        <ToastProvider>
          <Taste />
        </ToastProvider>
      </LazyMotion>
    </QueryClientProvider>,
  );
  return client;
}

describe("restored taste weights", () => {
  const newerProfile: Preferences = {
    ...restoredProfile,
    tagPreferences: [
      { id: "g5", name: "Newly restored favorite theme", weight: 2.5 },
      { id: "g6", name: "Newly restored avoided theme", weight: -0.5 },
    ],
    preferredLengths: [4],
    preferredPlatforms: ["lin"],
  };

  it("refreshes an already-open pristine form when restored preferences arrive", async () => {
    const client = start();
    await screen.findByText("Restored strong preference");
    vi.mocked(api.preferences).mockResolvedValue(newerProfile);
    await act(async () => client.setQueryData(["preferences"], newerProfile));
    expect(
      await screen.findByText("Newly restored favorite theme"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("Restored strong preference"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("checkbox", { name: "Long" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Short" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Linux" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Windows" })).not.toBeChecked();
    expect(
      screen.getByText("Your taste profile is up to date."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save taste profile" }));
    await waitFor(() =>
      expect(vi.mocked(api.savePreferences).mock.calls[0]?.[0]).toEqual(
        newerProfile,
      ),
    );
  });

  it("preserves a local dirty draft when newer cached preferences arrive", async () => {
    const client = start();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Short" }));
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    vi.mocked(api.preferences).mockResolvedValue(newerProfile);
    await act(async () => client.setQueryData(["preferences"], newerProfile));
    expect(screen.getByText("Restored strong preference")).toBeInTheDocument();
    expect(
      screen.queryByText("Newly restored favorite theme"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Short" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Long" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Windows" })).toBeChecked();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save taste profile" }));
    await waitFor(() =>
      expect(vi.mocked(api.savePreferences).mock.calls[0]?.[0]).toEqual({
        ...restoredProfile,
        preferredLengths: [2],
      }),
    );
  });

  it("shows valid non-preset weights in their corresponding preference groups", async () => {
    start();
    const love = await screen.findByRole("region", { name: "Love" });
    const like = screen.getByRole("region", { name: "Like" });
    const avoid = screen.getByRole("region", { name: "Avoid" });
    expect(
      within(love).getByText("Restored strong preference"),
    ).toBeInTheDocument();
    expect(
      within(like).getByText("Restored mild preference"),
    ).toBeInTheDocument();
    expect(
      within(avoid).getByText("Restored avoided theme"),
    ).toBeInTheDocument();
    for (const group of [love, like, avoid]) {
      expect(within(group).getByText("1 tag")).toBeInTheDocument();
      expect(
        within(group).queryByText("Neutral theme"),
      ).not.toBeInTheDocument();
    }
  });

  it("preserves the exact restored weights when saving an unrelated reading-length change", async () => {
    start();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Short" }));
    fireEvent.click(screen.getByRole("button", { name: "Save taste profile" }));
    await waitFor(() =>
      expect(vi.mocked(api.savePreferences).mock.calls[0]?.[0]).toEqual({
        ...restoredProfile,
        preferredLengths: [2],
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Profile saved" }),
    ).toBeInTheDocument();
    expect(
      vi.mocked(api.savePreferences).mock.calls[0][0].tagPreferences,
    ).toEqual(restoredProfile.tagPreferences);
    expect(restoredProfile.preferredLengths).toEqual([]);
  });
});
