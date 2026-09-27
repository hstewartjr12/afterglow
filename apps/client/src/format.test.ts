import { describe, expect, it } from "vitest";
import { clean, releaseYears } from "./lib/format";

describe("VNDB description cleanup", () => {
  it("removes spoiler blocks instead of revealing their contents", () => {
    expect(clean("Intro. [spoiler]The twist.[/spoiler] Outro.")).toBe(
      "Intro.  Outro.",
    );
  });

  it("unwraps links and formatting while keeping ordinary brackets", () => {
    expect(
      clean("See [url=https://x.test]this[/url], [b]bold[/b] [Chapter 1]"),
    ).toBe("See this, bold [Chapter 1]");
  });

  it("falls back when nothing readable remains", () => {
    expect(clean("[spoiler]Everything[/spoiler]")).toBe(
      "No spoiler-free description is available.",
    );
    expect(clean(null)).toBe("No spoiler-free description is available.");
  });
});

describe("release year options", () => {
  it("lists recent years, then every fifth year back to 1980", () => {
    expect(releaseYears(2026)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2020, 2015, 2010, 2005, 2000, 1995, 1990,
      1985, 1980,
    ]);
  });

  it("does not repeat a year that is already a multiple of five", () => {
    const years = releaseYears(2030);
    expect(new Set(years).size).toBe(years.length);
    expect(years.slice(0, 6)).toEqual([2030, 2029, 2028, 2027, 2026, 2025]);
  });
});
