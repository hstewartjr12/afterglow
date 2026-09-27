import { describe, expect, it } from "vitest";
import { clean } from "./lib/format";

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
