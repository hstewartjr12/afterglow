import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import type {
  LibraryEntry,
  RecommendationFeedback,
  VnSummary,
} from "@afterglow/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { Card } from "./Card";
import { ToastProvider } from "./Toasts";
import { Home } from "../views/Home";
import { RecommendationFeedbackPanel } from "./RecommendationFeedback";

const alpha: VnSummary = {
  id: "v1",
  title: "Alpha Story",
  alttitle: null,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: null,
  rating: null,
  voteCount: 0,
  length: null,
  platforms: [],
  tags: [],
};
const beta = { ...alpha, id: "v2", title: "Beta Story" };
const recommendations = [alpha, beta].map((vn) => ({
  vn,
  score: 70,
  matchPercent: 70,
  reasons: ["A promising story."],
}));
const entry = (patch: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: 1,
  vndbId: alpha.id,
  vn: alpha,
  status: "wishlist",
  personalRating: null,
  favorite: false,
  progress: 0,
  notes: "",
  startedAt: null,
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...patch,
});
let library: LibraryEntry[];
let feedback: RecommendationFeedback[];

beforeEach(() => {
  library = [];
  feedback = [];
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(api, "library").mockImplementation(async () => library);
  vi.spyOn(api, "feedback").mockImplementation(async () => feedback);
  vi.spyOn(api, "recommendations").mockResolvedValue(recommendations);
  vi.spyOn(api, "quickWishlist").mockImplementation(async () => {
    const saved = entry();
    library = [saved];
    return { entry: saved, created: true };
  });
  vi.spyOn(api, "saveLibrary");
  vi.spyOn(api, "saveFeedback").mockImplementation(async (vn, until) => {
    const choice = {
      vndbId: vn.id,
      vn,
      until,
      createdAt: new Date().toISOString(),
    };
    feedback = [...feedback.filter((item) => item.vndbId !== vn.id), choice];
    return choice;
  });
  vi.spyOn(api, "removeFeedback").mockImplementation(async (id) => {
    feedback = feedback.filter((item) => item.vndbId !== id);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function start(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(["library"], library);
  client.setQueryData(["feedback"], feedback);
  client.setQueryData(["recommendations"], recommendations);
  client.setQueryData(["preferences"], {
    completed: true,
    tagPreferences: [],
    preferredLengths: [],
    preferredPlatforms: [],
    useSpoilerTagsInRecommendations: false,
  });
  const view = render(
    <QueryClientProvider client={client}>
      <LazyMotion features={domMax} strict>
        <ToastProvider>{children}</ToastProvider>
      </LazyMotion>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
const home = () => <Home go={() => true} open={() => {}} />;
const hero = (title: string) =>
  screen.getByRole("heading", { level: 1, name: title });

it("blocks duplicate wishlist clicks, reports pending state, and never opens the card", async () => {
  let finish!: (result: { entry: LibraryEntry; created: boolean }) => void;
  vi.mocked(api.quickWishlist).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const open = vi.fn();
  const { client } = start(<Card vn={alpha} onOpen={open} />);
  const button = screen.getByRole("button", { name: "Wishlist" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(api.quickWishlist).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
  expect(open).not.toHaveBeenCalled();
  library = [entry()];
  await act(async () => finish({ entry: library[0], created: true }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Wishlist" }),
    ).not.toBeInTheDocument(),
  );
  expect(client.getQueryData(["library"])).toEqual(library);
  expect(api.saveLibrary).not.toHaveBeenCalled();
  const openButton = screen.getByRole("button", { name: alpha.title });
  expect(openButton.querySelector("button")).toBeNull();
  fireEvent.click(openButton);
  expect(open).toHaveBeenCalledWith(alpha);
});

it("keeps an existing tracker returned by the atomic endpoint intact", async () => {
  const existing = entry({
    status: "completed",
    progress: 100,
    personalRating: 9,
    favorite: true,
    notes: "Keep my routes and notes",
  });
  vi.mocked(api.quickWishlist).mockImplementation(async () => {
    library = [existing];
    return { entry: existing, created: false };
  });
  const { client } = start(<Card vn={alpha} onOpen={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
  expect(await screen.findByText("Finished")).toBeInTheDocument();
  expect(client.getQueryData(["library"])).toEqual([existing]);
  expect(api.saveLibrary).not.toHaveBeenCalled();
});

it("shows a wishlist error and retries without replacing a tracker", async () => {
  vi.mocked(api.quickWishlist).mockRejectedValueOnce(
    new Error("Could not add this story"),
  );
  start(<Card vn={alpha} onOpen={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not add this story",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry wishlist" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(api.quickWishlist).toHaveBeenCalledTimes(2);
  expect(api.saveLibrary).not.toHaveBeenCalled();
});

it("retains the separate cover reveal action without opening details", () => {
  const open = vi.fn();
  start(
    <Card
      vn={{ ...alpha, imageUrl: "/sensitive.jpg", imageSexual: 2 }}
      onOpen={open}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reveal cover" }));
  expect(screen.getByAltText(`${alpha.title} cover`)).toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
});

it("postpones immediately for 24 hours, guards rapid clicks, and supports Undo", async () => {
  let finish!: (choice: RecommendationFeedback) => void;
  vi.mocked(api.saveFeedback).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  start(home());
  const before = Date.now();
  const postpone = screen.getByRole("button", {
    name: "Not tonight — show another",
  });
  fireEvent.click(postpone);
  fireEvent.click(postpone);
  await waitFor(() => expect(api.saveFeedback).toHaveBeenCalledTimes(1));
  expect(hero(beta.title)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Not tonight — show another" }),
  ).toBeDisabled();
  const [vn, until] = vi.mocked(api.saveFeedback).mock.calls[0];
  expect(vn).toEqual(alpha);
  expect(Date.parse(until!)).toBeGreaterThanOrEqual(
    before + 24 * 60 * 60 * 1000,
  );
  feedback = [
    { vndbId: alpha.id, vn: alpha, until, createdAt: new Date().toISOString() },
  ];
  await act(async () => finish(feedback[0]));
  fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() => expect(hero(alpha.title)).toBeInTheDocument());
  expect(api.removeFeedback).toHaveBeenCalledWith(alpha.id);
});

it("rolls back failed hiding and allows a retry", async () => {
  vi.mocked(api.saveFeedback).mockRejectedValueOnce(
    new Error("Your choice could not be saved"),
  );
  start(home());
  fireEvent.click(screen.getByRole("button", { name: "Hide this story" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your choice could not be saved",
  );
  expect(hero(alpha.title)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(hero(beta.title)).toBeInTheDocument());
  expect(api.saveFeedback).toHaveBeenLastCalledWith(alpha, null);
});

it("keeps hidden stories excluded after remount and restores them from the panel", async () => {
  const view = start(home());
  fireEvent.click(screen.getByRole("button", { name: "Hide this story" }));
  await waitFor(() => expect(hero(beta.title)).toBeInTheDocument());
  await screen.findByRole("button", { name: "Undo" });
  view.unmount();
  start(
    <>
      {home()}
      <RecommendationFeedbackPanel />
    </>,
  );
  expect(hero(beta.title)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: `Restore ${alpha.title}` }),
  );
  await waitFor(() => expect(hero(alpha.title)).toBeInTheDocument());
  expect(api.removeFeedback).toHaveBeenCalledWith(alpha.id);
});

it("restores a failed panel removal and exposes a working retry", async () => {
  feedback = [
    {
      vndbId: alpha.id,
      vn: alpha,
      until: null,
      createdAt: new Date().toISOString(),
    },
  ];
  vi.mocked(api.removeFeedback).mockRejectedValueOnce(
    new Error("Could not restore your story"),
  );
  start(<RecommendationFeedbackPanel />);
  fireEvent.click(
    screen.getByRole("button", { name: `Restore ${alpha.title}` }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not restore your story",
  );
  expect(
    screen.getByRole("button", { name: `Restore ${alpha.title}` }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByText("No stories are hidden or postponed."),
  ).toBeInTheDocument();
});

it("unblocks a postponed title while Home stays mounted when its expiry arrives", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  feedback = [
    {
      vndbId: alpha.id,
      vn: alpha,
      until: new Date(Date.now() + 1000).toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];
  start(home());
  expect(hero(beta.title)).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(hero(alpha.title)).toBeInTheDocument();
  expect(api.recommendations).toHaveBeenCalled();
});
