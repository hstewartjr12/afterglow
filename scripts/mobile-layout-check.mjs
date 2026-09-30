/** Run against a local client preview: LAYOUT_URL=http://127.0.0.1:5195 node scripts/mobile-layout-check.mjs */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const origin = process.env.LAYOUT_URL || "http://127.0.0.1:5195";
const out = process.env.LAYOUT_OUT || "/tmp/afterglow-layout-check";
const story = {
  id: "v1",
  title: "A Story for Tonight",
  alttitle: null,
  imageUrl: null,
  imageSexual: 0,
  imageViolence: 0,
  released: "2024-01-01",
  rating: 85,
  voteCount: 100,
  length: 3,
  platforms: ["win"],
  aliases: [],
  tags: [{ id: "g1", name: "Mystery", rating: 3, spoiler: 0 }],
  description: "A story about finding your way home.\n\n".repeat(20),
};
const tag = {
  id: "g1",
  name: "Mystery",
  aliases: [],
  description: "A mystery to unravel.",
  category: "cont",
  searchable: true,
  applicable: true,
  vnCount: 500,
};
const recommendation = {
  vn: story,
  score: 85,
  matchPercent: 85,
  reasons: ["A story matching your interests."],
};
const browser = await chromium.launch({ headless: true });
await mkdir(out, { recursive: true });
const passed = [];

async function fixture(page) {
  let preferences = {
    tagPreferences: [],
    preferredLengths: [],
    preferredPlatforms: [],
    completed: false,
    useSpoilerTagsInRecommendations: false,
  };
  let library = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body;
    if (url.pathname === "/api/preferences") {
      if (request.method() === "PUT") preferences = request.postDataJSON();
      body = preferences;
    } else if (url.pathname === "/api/library") body = library;
    else if (url.pathname.startsWith("/api/library/")) {
      const input = request.postDataJSON();
      body = {
        id: 1,
        vndbId: story.id,
        ...input,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      };
      library = [body];
    } else if (url.pathname === "/api/recommendations") body = [recommendation];
    else if (url.pathname === "/api/recommendations/score")
      body = [recommendation];
    else if (url.pathname.startsWith("/api/recommendations/"))
      body = recommendation;
    else if (url.pathname === "/api/vndb/candidates") body = [story];
    else if (url.pathname.startsWith("/api/vndb/vn/")) body = story;
    else if (url.pathname === "/api/vndb/search")
      body = {
        results: url.searchParams.get("q") === "nothing" ? [] : [story],
        count: 1,
        more: false,
      };
    else if (url.pathname === "/api/vndb/tags")
      body = {
        results:
          url.searchParams.get("q") === "nothing"
            ? []
            : Array.from({ length: 20 }, (_, i) => ({
                ...tag,
                id: `g${i + 1}`,
                name: i ? `Theme ${i}` : tag.name,
              })),
        recordCount: 20,
        usableOnPage: 20,
        page: 1,
        more: false,
      };
    else throw new Error(`Missing fixture: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
}

async function navigation(page, label) {
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  ) {
    const button = await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .boundingBox();
    await page.mouse.click(
      button.x + button.width / 2,
      button.y + button.height / 2,
    );
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("button", { name: label, exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector(".mobile-nav"));
  } else
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: label, exact: true })
      .click();
}

async function canvas(page, name, layer) {
  await page.waitForFunction(() => !document.querySelector(".eyecatch"));
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".modal-layer")].every(
      (el) => Number(getComputedStyle(el).opacity) === 1,
    ),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `${name}: horizontal overflow`,
  );
  if (layer) {
    const geometry = await page.locator(layer).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        viewport: innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });
    assert.ok(
      geometry.bottom >= geometry.viewport - 1,
      `${name}: background ends before the screen bottom`,
    );
    assert.equal(
      geometry.bodyOverflow,
      "visible",
      `${name}: body background clipped`,
    );
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  passed.push(name);
}

try {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [740, 360],
    [1440, 1000],
  ]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
        colorScheme: theme,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await fixture(page);
      const prefix = `${width}x${height}-${theme}`;
      await page.goto(origin);
      await page
        .getByRole("heading", { name: "What do you love in a story?" })
        .waitFor();
      await canvas(page, `${prefix}-onboarding`);
      await page
        .getByRole("button", { name: "Skip for now", exact: true })
        .click();
      await page.locator(".onboarding").waitFor({ state: "hidden" });
      await canvas(page, `${prefix}-home`);
      await navigation(page, "Library");
      await page
        .getByRole("heading", { name: "Your shelf is waiting." })
        .waitFor();
      await canvas(page, `${prefix}-library-empty`);
      await navigation(page, "Discover");
      await page.locator(".vn-card").first().waitFor();
      await canvas(page, `${prefix}-discover`);
      const card = page.locator(".vn-card").first();
      const cardTop = await card.evaluate(
        (el) => el.getBoundingClientRect().top + scrollY,
      );
      await page.evaluate(
        (top) => window.scrollTo(0, Math.max(120, top - 90)),
        cardTop,
      );
      const scroll = await page.evaluate(() => scrollY);
      const cardBox = await card.boundingBox();
      await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + 20);
      const detail = page.getByRole("dialog", { name: story.title });
      await detail.waitFor();
      await canvas(page, `${prefix}-details`, ".modal-layer");
      if (width <= 800) {
        const bounds = await detail.boundingBox();
        assert.ok(
          Math.abs(bounds.y) < 30,
          `Details bounds: ${JSON.stringify(bounds)}`,
        );
        const visible = await detail.evaluate((el) => ({
          height: el.getBoundingClientRect().height,
          viewport: visualViewport.height,
          overflow: getComputedStyle(el).overflowY,
          rootOverflow: getComputedStyle(document.documentElement).overflowY,
          appDisplay: getComputedStyle(document.querySelector(".site")).display,
        }));
        assert.ok(visible.height >= visible.viewport);
        assert.equal(visible.overflow, "visible");
        assert.equal(visible.rootOverflow, "visible");
        assert.equal(visible.appDisplay, "none");
        await page.setViewportSize({ width, height: Math.min(height, 400) });
        await page.waitForFunction(
          () =>
            document.querySelector(".detail-sheet").getBoundingClientRect()
              .height >= visualViewport.height,
        );
        await page.setViewportSize({ width, height });
      }
      await detail.getByRole("button", { name: "How matching works" }).click();
      await page.getByRole("note").waitFor();
      await page.keyboard.press("Escape");
      await detail
        .getByRole("button", { name: "Add to library", exact: true })
        .click();
      await detail
        .getByRole("button", { name: "Remove from library", exact: true })
        .waitFor();
      await page
        .getByRole("status")
        .getByText(`Added ${story.title} to your library`, { exact: true })
        .waitFor({ state: "visible" });
      await detail.getByRole("button", { name: "Close details" }).click();
      await page.waitForFunction(() => !document.querySelector(".modal-layer"));
      assert.equal(
        await page.evaluate(() => document.documentElement.style.overflow),
        "",
      );
      assert.equal(await page.evaluate(() => scrollY), scroll);
      await navigation(page, "Library");
      await page.locator(".ledger-row").first().waitFor();
      await canvas(page, `${prefix}-library-populated`);
      await navigation(page, "My taste");
      await page
        .getByRole("heading", { name: "Your taste, in detail." })
        .waitFor();
      await canvas(page, `${prefix}-taste`);
      await page.getByRole("button", { name: "Browse all tags →" }).click();
      const index = page.getByRole("dialog", { name: "VNDB tag index" });
      await index.locator(".tag-row").first().waitFor();
      await canvas(page, `${prefix}-tag-index`, ".modal-layer");
      await index
        .getByRole("textbox", { name: "Search VNDB tags" })
        .fill("nothing");
      await index
        .getByText("No tags match. Try another search or category.")
        .waitFor();
      await canvas(page, `${prefix}-tag-index-empty`, ".modal-layer");
      if (width <= 800) {
        await page.setViewportSize({ width, height: Math.min(height, 400) });
        await page.waitForFunction(
          () =>
            document.querySelector(".tag-index").getBoundingClientRect()
              .height >= visualViewport.height,
        );
        await index
          .getByRole("button", { name: "Next →" })
          .scrollIntoViewIfNeeded();
        assert.equal(
          await page.evaluate(() => getComputedStyle(document.body).overflow),
          "visible",
        );
        await page.setViewportSize({ width, height });
      }
      await index.getByRole("button", { name: "Close tag index" }).click();
      await page.waitForFunction(() => !document.querySelector(".modal-layer"));
      await page
        .getByRole("checkbox", { name: "Windows", exact: true })
        .check();
      await canvas(page, `${prefix}-taste-unsaved`);
      await page
        .getByRole("button", { name: "Save taste profile", exact: true })
        .click();
      await navigation(page, "Discover");
      await page
        .getByRole("textbox", { name: "Search the catalogue" })
        .fill("nothing");
      await page.getByRole("heading", { name: "No stories match." }).waitFor();
      await canvas(page, `${prefix}-search-empty`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  const transitionPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await fixture(transitionPage);
  await transitionPage.goto(origin);
  await transitionPage
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await transitionPage.locator(".onboarding").waitFor({ state: "hidden" });
  await transitionPage.evaluate(() => window.scrollTo(0, 200));
  await navigation(transitionPage, "Library");
  const eye = transitionPage.locator(".eyecatch");
  await eye.waitFor();
  const transitionBounds = await eye.boundingBox();
  assert.ok(
    transitionBounds.y + transitionBounds.height >= 844,
    "Chapter transition paints to the screen bottom",
  );
  assert.equal(
    await transitionPage.evaluate(
      () => document.documentElement.style.overflow,
    ),
    "hidden",
    "The closing menu must not unlock the page while the transition is active",
  );
  await eye.waitFor({ state: "hidden" });
  assert.equal(
    await transitionPage.evaluate(
      () => document.documentElement.style.overflow,
    ),
    "",
  );
  await transitionPage.close();
  const safariPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await safariPage.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {
      height: 734,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      value: viewport,
      configurable: true,
    });
    window.setVisibleHeight = (height) => {
      viewport.height = height;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  await fixture(safariPage);
  await safariPage.goto(origin);
  await safariPage
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await safariPage.locator(".onboarding").waitFor({ state: "hidden" });
  await safariPage
    .getByRole("button", { name: "Open story", exact: true })
    .click();
  const safariDetail = safariPage.getByRole("dialog", { name: story.title });
  await safariDetail.waitFor();
  await canvas(safariPage, "safari-toolbar-detail", ".modal-layer");
  const toolbarGeometry = await safariDetail.evaluate((el) => ({
    bounds: el.getBoundingClientRect().toJSON(),
    visibleHeight: visualViewport.height,
    overflow: getComputedStyle(el).overflowY,
    rootOverflow: getComputedStyle(document.documentElement).overflowY,
    continuation:
      document
        .elementFromPoint(100, innerHeight - 20)
        ?.closest(".detail-sheet") === el,
    railUncovered: !document
      .elementFromPoint(3, innerHeight - 20)
      ?.closest(".sheet"),
  }));
  assert.ok(
    toolbarGeometry.bounds.bottom >= 843,
    "The scrolling detail sheet must extend through the toolbar area",
  );
  assert.ok(
    toolbarGeometry.continuation,
    "Actual detail content, rather than only backdrop color, must continue below the visible viewport",
  );
  assert.ok(
    toolbarGeometry.railUncovered,
    "The detail sheet must leave the page rail visible",
  );
  assert.equal(toolbarGeometry.overflow, "visible");
  assert.equal(toolbarGeometry.rootOverflow, "visible");
  await safariPage.evaluate(() => window.scrollTo(0, 300));
  assert.equal(await safariDetail.evaluate((el) => el.scrollTop), 0);
  assert.equal(await safariPage.evaluate(() => scrollY), 300);
  await canvas(safariPage, "safari-toolbar-detail-scrolled", ".modal-layer");
  await safariDetail.getByRole("textbox", { name: /Private notes/ }).focus();
  await safariPage.setViewportSize({ width: 390, height: 420 });
  await safariPage.evaluate(() => window.setVisibleHeight(420));
  await safariDetail
    .getByRole("button", { name: "Add to library", exact: true })
    .scrollIntoViewIfNeeded();
  const actionBounds = await safariDetail
    .getByRole("button", { name: "Add to library", exact: true })
    .boundingBox();
  assert.ok(
    actionBounds.y + actionBounds.height <= 421,
    "Actions must stay reachable while editing with the keyboard open",
  );
  await safariPage.close();
  console.log(
    JSON.stringify({
      passed: passed.length,
      screens: [
        "onboarding",
        "home",
        "discover",
        "library empty/populated",
        "taste clean/unsaved",
        "details",
        "tag index results/empty",
        "search empty",
      ],
      themes: ["light", "dark"],
      sizes: ["390x844", "320x568", "740x360", "1440x1000"],
      checks: [
        "bottom canvas coverage",
        "scroll and focus",
        "short dialog viewports",
        "no horizontal overflow",
        "chapter transition coverage and overlapping scroll locks",
        "document scrolling behind the floating toolbar and keyboard clearance",
      ],
      screenshots: out,
    }),
  );
} finally {
  await browser.close();
}
