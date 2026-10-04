import { languages } from "@afterglow/shared/constants";
import type { View } from "../types";

export type DiscoverState = {
  q: string;
  platform: string;
  language: string;
  tag: string;
  tagName: string;
  length: string;
  year: string;
  rating: string;
  sort: string;
  page: number;
};
export type LibraryState = {
  filter: string;
  term: string;
  favoritesOnly: boolean;
  sort: string;
};
export type AppRoute = {
  view: View;
  vn: string | null;
  discover: DiscoverState;
  library: LibraryState;
};
export const defaultDiscover = (): DiscoverState => ({
  q: "",
  platform: "",
  language: "",
  tag: "",
  tagName: "",
  length: "",
  year: "",
  rating: "",
  sort: "searchrank",
  page: 1,
});
export const defaultLibrary = (): LibraryState => ({
  filter: "all",
  term: "",
  favoritesOnly: false,
  sort: "updated",
});
const oneOf = (value: string | null, choices: string[], fallback = "") =>
  value && choices.includes(value) ? value : fallback;
export function readRoute(search: string, previous?: AppRoute): AppRoute {
  const p = new URLSearchParams(search);
  const view = oneOf(
    p.get("view"),
    ["home", "discover", "library", "taste"],
    "home",
  ) as View;
  const route: AppRoute = {
    view,
    vn: /^v\d+$/.test(p.get("vn") ?? "") ? p.get("vn") : null,
    discover: previous?.discover ?? defaultDiscover(),
    library: previous?.library ?? defaultLibrary(),
  };
  if (view === "discover") {
    const page = Number(p.get("page") ?? 1);
    route.discover = {
      q: (p.get("q") ?? "").slice(0, 100),
      platform: oneOf(p.get("platform"), [
        "win",
        "lin",
        "mac",
        "and",
        "ios",
        "swi",
        "ps4",
        "ps5",
      ]),
      language: oneOf(p.get("language"), [...languages]),
      tag: /^g\d+$/.test(p.get("tag") ?? "") ? p.get("tag")! : "",
      tagName: /^g\d+$/.test(p.get("tag") ?? "")
        ? (p.get("tagName") ?? "").slice(0, 100)
        : "",
      length: oneOf(p.get("length"), ["1", "2", "3", "4", "5"]),
      year:
        /^\d{4}$/.test(p.get("year") ?? "") &&
        Number(p.get("year")) >= 1980 &&
        Number(p.get("year")) <= new Date().getFullYear()
          ? p.get("year")!
          : "",
      rating: oneOf(p.get("rating"), [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
      ]),
      sort: oneOf(
        p.get("sort"),
        ["searchrank", "rating", "votecount", "released", "title"],
        "searchrank",
      ),
      page:
        Number.isSafeInteger(page) && page >= 1 && page <= 100000 ? page : 1,
    };
  }
  if (view === "library")
    route.library = {
      filter: oneOf(
        p.get("filter"),
        ["all", "wishlist", "backlog", "playing", "completed", "dropped"],
        "all",
      ),
      term: (p.get("q") ?? "").slice(0, 100),
      favoritesOnly: p.get("favorites") === "1",
      sort: oneOf(
        p.get("sort"),
        ["updated", "title", "rating", "progress"],
        "updated",
      ),
    };
  return route;
}
export function routeSearch(route: AppRoute): string {
  const p = new URLSearchParams();
  if (route.view !== "home") p.set("view", route.view);
  if (route.vn) p.set("vn", route.vn);
  if (route.view === "discover") {
    for (const key of [
      "q",
      "platform",
      "language",
      "tag",
      "tagName",
      "length",
      "year",
      "rating",
    ] as const)
      if (route.discover[key]) p.set(key, route.discover[key]);
    if (route.discover.sort !== "searchrank")
      p.set("sort", route.discover.sort);
    if (route.discover.page !== 1) p.set("page", String(route.discover.page));
  }
  if (route.view === "library") {
    const { filter, term, favoritesOnly, sort } = route.library;
    if (filter !== "all") p.set("filter", filter);
    if (term) p.set("q", term);
    if (favoritesOnly) p.set("favorites", "1");
    if (sort !== "updated") p.set("sort", sort);
  }
  return p.size ? `?${p}` : "";
}
export const storyUrl = (id: string) =>
  `${location.origin}${location.pathname}?vn=${encodeURIComponent(id)}`;
