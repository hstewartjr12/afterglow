import { describe, expect, it } from "vitest";
import {
  defaultDiscover,
  defaultLibrary,
  readRoute,
  routeSearch,
} from "./navigation";

describe("browse URLs", () => {
  it("round trips filters, pagination and a story without losing labels", () => {
    const route = {
      view: "discover" as const,
      vn: "v17",
      discover: {
        ...defaultDiscover(),
        q: "Steins;Gate",
        platform: "win",
        language: "en",
        tag: "g1",
        tagName: "Mystery & suspense",
        page: 3,
      },
      library: defaultLibrary(),
    };
    expect(readRoute(routeSearch(route))).toEqual(route);
  });
  it("normalizes unsupported URL values before requesting the catalogue", () => {
    const route = readRoute(
      "?view=discover&vn=bad&page=-1&language=bad&platform=bad&tag=spoiler&year=1800&length=9&sort=bad",
    );
    expect(route.vn).toBeNull();
    expect(route.discover).toEqual(defaultDiscover());
  });
  it("restores library filters while retaining inactive discovery state", () => {
    const previous = {
      view: "discover" as const,
      vn: null,
      discover: { ...defaultDiscover(), language: "en", page: 4 },
      library: defaultLibrary(),
    };
    const route = readRoute(
      "?view=library&filter=playing&favorites=1&sort=rating&q=chapter",
      previous,
    );
    expect(route.discover).toEqual(previous.discover);
    expect(route.library).toEqual({
      filter: "playing",
      favoritesOnly: true,
      sort: "rating",
      term: "chapter",
    });
    expect(readRoute(routeSearch(route), previous)).toEqual(route);
  });
});
