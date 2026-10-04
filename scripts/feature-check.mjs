/**
 * Build/start a local preview, then run:
 *   FEATURE_URL=http://127.0.0.1:5195 node scripts/feature-check.mjs
 *   FEATURE_STORAGE=browser FEATURE_URL=http://127.0.0.1:5196 node scripts/feature-check.mjs
 * Server mode mocks personal APIs; browser mode exercises actual IndexedDB and
 * rejects personal HTTP requests. Both modes use fixtures for the public catalogue and
 * cover images. Screenshots/results go to FEATURE_OUT (default /tmp).
 */
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  backupImportSchema,
  backupSchema,
  libraryInputSchema,
  preferencesSchema,
} from "@afterglow/shared";

const base = new URL(process.env.FEATURE_URL || "http://127.0.0.1:5195");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "FEATURE_URL must be a local preview; this check must not touch a live library",
);
const storage = process.env.FEATURE_STORAGE || "server";
assert.ok(["server", "browser"].includes(storage), "Invalid FEATURE_STORAGE");
const out = process.env.FEATURE_OUT || `/tmp/afterglow-features-${storage}`;
const time = "2026-10-01T12:00:00.000Z";
const titles = Array.from({ length: 36 }, (_, i) => ({
  id: `v${i + 1}`,
  title: `Fixture Story ${String(i + 1).padStart(2, "0")}`,
  alttitle: null,
  imageUrl: `https://t.vndb.org/cv/feature-${i + 1}.svg`,
  imageSexual: 0,
  imageViolence: 0,
  released: "2024-01-01",
  rating: 90 - i / 2,
  voteCount: 1000 - i * 10,
  length: 3,
  platforms: ["win"],
  tags: [{ id: "g1", name: "Mystery", rating: 3, spoiler: 0 }],
}));
const preferences = {
  tagPreferences: [{ id: "g1", name: "Mystery", weight: 3 }],
  preferredLengths: [],
  preferredPlatforms: [],
  useSpoilerTagsInRecommendations: false,
  completed: true,
};
const tag = {
  id: "g1",
  name: "Mystery",
  aliases: [],
  description: "A mystery to unravel.",
  category: "cont",
  searchable: true,
  applicable: true,
  vnCount: 36,
};
const reading = entry(titles[35], {
  status: "playing",
  personalRating: 8,
  progress: 35,
  favorite: true,
  notes: "KEEP_PRIVATE_NOTES: a quiet scene to return to.",
  startedAt: "2026-10-01",
});
const savedChoice = {
  vndbId: titles[33].id,
  vn: titles[33],
  until: null,
  createdAt: time,
};
const seed = backup([reading], preferences, [savedChoice]);

function entry(vn, patch = {}) {
  return {
    id: Number(vn.id.slice(1)),
    vndbId: vn.id,
    vn,
    status: "wishlist",
    personalRating: null,
    favorite: false,
    progress: 0,
    notes: "",
    startedAt: null,
    completedAt: null,
    createdAt: time,
    updatedAt: time,
    ...patch,
  };
}

function backup(library, profile, feedback = []) {
  return backupSchema.parse({
    kind: "afterglow-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    library,
    preferences: profile,
    feedback,
  });
}

function recommendation(vn) {
  return {
    vn,
    score: vn.rating,
    matchPercent: 85,
    reasons: ["Mystery matches your taste.", "A story for a quiet evening."],
  };
}

function cover(index) {
  const hue = (Number(index) * 29) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="680" viewBox="0 0 480 680"><rect width="480" height="680" fill="hsl(${hue},25%,24%)"/><circle cx="240" cy="240" r="140" fill="hsl(${hue},35%,55%)"/><path d="M0 480L240 300L480 480V680H0Z" fill="hsl(${hue},25%,15%)"/><text x="240" y="565" text-anchor="middle" fill="#f4efe5" font-family="serif" font-size="35">MYSTERY</text><text x="240" y="615" text-anchor="middle" fill="#f4efe5" font-family="serif" font-size="24">STORY ${index}</text></svg>`;
}

async function installFixtures(context, violations) {
  let state = {
    library: [],
    preferences: structuredClone(preferences),
    feedback: [],
  };
  let nextId = 1;
  const searches = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const image =
      pathname === "/api/cover"
        ? url.searchParams.get("url")
        : url.hostname === "t.vndb.org"
          ? url.href
          : null;
    if (image) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: cover(image.match(/feature-(\d+)/)?.[1] || "1"),
      });
      return;
    }
    if (!pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    let body;
    const method = request.method();
    if (pathname === "/api/vndb/search" && method === "GET") {
      searches.push(Object.fromEntries(url.searchParams));
      let found = titles.filter((vn, index) => {
        const q = url.searchParams.get("q")?.toLowerCase() || "";
        const language = url.searchParams.get("language");
        const selectedTag = url.searchParams.get("tag");
        return (
          vn.title.toLowerCase().includes(q) &&
          (!language || (language === "en" ? index < 32 : index >= 32)) &&
          (!selectedTag || selectedTag === "g1")
        );
      });
      if (url.searchParams.get("sort") === "title")
        found = found.toSorted((a, b) => a.title.localeCompare(b.title));
      const page = Number(url.searchParams.get("page") || 1);
      body = {
        results: found.slice((page - 1) * 30, page * 30),
        count: found.length,
        more: found.length > page * 30,
      };
    } else if (pathname === "/api/vndb/tags" && method === "GET") {
      const matches = tag.name
        .toLowerCase()
        .includes((url.searchParams.get("q") || "").toLowerCase());
      body = {
        results: matches ? [tag] : [],
        recordCount: matches ? 1 : 0,
        usableOnPage: matches ? 1 : 0,
        page: 1,
        more: false,
      };
    } else if (pathname === "/api/vndb/candidates" && method === "GET") {
      // The demo worker returns cumulative candidate pages.
      body = titles.slice(0, Number(url.searchParams.get("page") || 1) * 30);
    } else if (/^\/api\/vndb\/vn\/v\d+$/.test(pathname) && method === "GET") {
      const vn = titles.find((title) => title.id === pathname.split("/").pop());
      assert.ok(vn, `Unknown catalogue fixture: ${pathname}`);
      body = {
        ...vn,
        aliases: [],
        description: "A mystery unfolds beneath the evening sky.",
      };
    } else if (storage === "browser") {
      violations.push(`${method} ${pathname}`);
      await route.abort("blockedbyclient");
      return;
    } else if (pathname === "/api/library" && method === "GET")
      body = state.library;
    else if (
      /^\/api\/library\/v\d+\/wishlist$/.test(pathname) &&
      method === "PUT"
    ) {
      const vn = request.postDataJSON().vn;
      const existing = state.library.find((item) => item.vndbId === vn.id);
      const created = !existing;
      const saved = existing || entry(vn, { id: nextId++ });
      if (created) state.library.push(saved);
      body = { entry: saved, created };
    } else if (
      /^\/api\/library\/v\d+$/.test(pathname) &&
      ["PUT", "DELETE"].includes(method)
    ) {
      const id = pathname.split("/").pop();
      const existing = state.library.find((item) => item.vndbId === id);
      if (method === "DELETE") {
        state.library = state.library.filter((item) => item.vndbId !== id);
        body = null;
      } else {
        const input = libraryInputSchema.parse(request.postDataJSON());
        body = entry(input.vn, {
          ...existing,
          ...input,
          id: existing?.id || nextId++,
        });
        state.library = [
          ...state.library.filter((item) => item.vndbId !== id),
          body,
        ];
      }
    } else if (
      pathname === "/api/preferences" &&
      ["GET", "PUT"].includes(method)
    ) {
      if (method === "PUT")
        state.preferences = preferencesSchema.parse(request.postDataJSON());
      body = state.preferences;
    } else if (pathname === "/api/feedback" && method === "GET")
      body = state.feedback;
    else if (
      /^\/api\/feedback\/v\d+$/.test(pathname) &&
      ["PUT", "DELETE"].includes(method)
    ) {
      const id = pathname.split("/").pop();
      const previous = state.feedback.find((item) => item.vndbId === id);
      state.feedback = state.feedback.filter((item) => item.vndbId !== id);
      if (method === "PUT") {
        body = {
          vndbId: id,
          ...request.postDataJSON(),
          createdAt: previous?.createdAt || new Date().toISOString(),
        };
        state.feedback.push(body);
      } else body = null;
    } else if (pathname === "/api/backup" && method === "GET") {
      body = backup(state.library, state.preferences, state.feedback);
    } else if (pathname === "/api/backup/import" && method === "POST") {
      const input = backupImportSchema.parse(request.postDataJSON());
      // Validate the complete import before publishing any personal changes.
      const next = structuredClone(state);
      body = { added: 0, updated: 0, kept: 0 };
      for (const item of input.backup.library) {
        const index = next.library.findIndex(
          (old) => old.vndbId === item.vndbId,
        );
        if (index < 0) {
          next.library.push({ ...item, id: nextId++ });
          body.added++;
        } else if (input.overwrite) {
          next.library[index] = { ...item, id: next.library[index].id };
          body.updated++;
        } else body.kept++;
      }
      for (const item of input.backup.feedback) {
        const index = next.feedback.findIndex(
          (old) => old.vndbId === item.vndbId,
        );
        if (index < 0) next.feedback.push(item);
        else if (input.overwrite) next.feedback[index] = item;
      }
      if (input.includePreferences) next.preferences = input.backup.preferences;
      state = next;
    } else if (pathname === "/api/recommendations" && method === "GET") {
      const excluded = new Set([
        ...state.library.map((item) => item.vndbId),
        ...state.feedback
          .filter(
            (item) =>
              item.until === null || Date.parse(item.until) > Date.now(),
          )
          .map((item) => item.vndbId),
      ]);
      body = titles.filter((vn) => !excluded.has(vn.id)).map(recommendation);
    } else if (pathname === "/api/recommendations/score" && method === "POST") {
      body = request.postDataJSON().vns.map(recommendation);
    } else if (
      /^\/api\/recommendations\/v\d+$/.test(pathname) &&
      method === "GET"
    ) {
      body = recommendation(
        titles.find((vn) => vn.id === pathname.split("/").pop()),
      );
    } else {
      // Never let an unrecognized personal endpoint fall through to the server.
      violations.push(`Unmocked ${method} ${pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ json: structuredClone(body) });
  });
  return searches;
}

function routeUrl(params = {}) {
  const url = new URL(base);
  url.search = new URLSearchParams(params).toString();
  return url.href;
}

async function navigate(page, label) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("button", { name: label, exact: true })
      .click();
    await page.locator(".mobile-nav").waitFor({ state: "hidden" });
  } else {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: label, exact: true })
      .click();
  }
  await page.locator(".eyecatch").waitFor({ state: "hidden" });
}

async function chooseBackup(
  page,
  value,
  { overwrite = false, profile = false } = {},
) {
  await page.getByLabel("Choose an Afterglow backup").setInputFiles({
    name: "feature-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await page.locator(".backup-preview").waitFor();
  const replace = page.getByRole("checkbox", {
    name: "Replace matching stories and recommendation dismissals with backup versions",
  });
  const taste = page.getByRole("checkbox", {
    name: "Restore the backup’s taste profile",
  });
  assert.equal(await replace.isChecked(), false, "Overwrite must be opt-in");
  assert.equal(
    await taste.isChecked(),
    false,
    "Taste restoration must be opt-in",
  );
  if (overwrite) await replace.check();
  if (profile) await taste.check();
}

async function restoreBackup(page, expected) {
  await page
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await page.locator(".backup-preview").waitFor({ state: "hidden" });
  await page.locator(".backup-result").filter({ hasText: expected }).waitFor();
}

async function exported(page) {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const file = await download;
  assert.match(
    file.suggestedFilename(),
    /^afterglow-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  return backupSchema.parse(
    JSON.parse(await readFile(await file.path(), "utf8")),
  );
}

function personalFields(item) {
  return Object.fromEntries(
    [
      "status",
      "personalRating",
      "favorite",
      "progress",
      "notes",
      "startedAt",
      "completedAt",
    ].map((key) => [key, item[key]]),
  );
}

async function snapshot(page, prefix, name) {
  await page.locator(".eyecatch").waitFor({ state: "hidden" });
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `${prefix}/${name}: horizontal overflow`,
  );
  const filename = path.join(out, `${prefix}-${name}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  return filename;
}

async function hero(page) {
  await page.locator(".hero-story h1").waitFor();
  // CSS uppercases display titles; persistence keys use their original text.
  return (await page.locator(".hero-story h1").textContent()).trim();
}

async function changedHero(page, old) {
  await page.waitForFunction((title) => {
    const headings = [...document.querySelectorAll(".hero-story h1")];
    return headings.length === 1 && headings[0].textContent !== title;
  }, old);
}

async function openFilters(page) {
  if (!(await page.getByRole("combobox", { name: /Language/ }).isVisible()))
    await page.getByRole("button", { name: /^Filters/ }).click();
}

const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir(out, { recursive: true });
await rm(path.join(out, "results.json"), { force: true });
try {
  for (const width of [1440, 390]) {
    for (const theme of ["dark", "light"]) {
      const prefix = `${storage}-${width}-${theme}`;
      console.log(`Checking ${prefix}`);
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        isMobile: width === 390,
        hasTouch: width === 390,
        reducedMotion: "reduce",
        colorScheme: theme,
        acceptDownloads: true,
      });
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: base.origin,
      });
      const errors = [];
      const violations = [];
      const searches = await installFixtures(context, violations);
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", (error) => errors.push(error.message));
      const screenshots = [];
      try {
        // Seed through the same validated file import used by real users.
        await page.goto(routeUrl({ view: "library" }));
        await page.getByRole("heading", { name: "Backup & restore" }).waitFor();
        await chooseBackup(page, seed, { profile: true });
        await restoreBackup(page, "1 added · 0 replaced · 0 kept");
        await page
          .locator(".ledger-row")
          .filter({ hasText: reading.vn.title })
          .waitFor();

        await navigate(page, "Discover");
        const firstCard = page.locator(".discover .vn-card").filter({
          has: page.getByRole("heading", {
            name: titles[0].title,
            exact: true,
          }),
        });
        await firstCard
          .getByRole("button", { name: "Wishlist", exact: true })
          .click();
        await firstCard.locator(".status-wishlist").waitFor();
        assert.equal(
          await page.locator(".detail-sheet").count(),
          0,
          "Wishlist must not open details",
        );
        await page.reload();
        await firstCard.locator(".status-wishlist").waitFor();
        screenshots.push(await snapshot(page, prefix, "quick-wishlist"));

        const pagination = page.getByRole("navigation", {
          name: "Search result pages",
        });
        await pagination.getByRole("button", { name: "Next →" }).click();
        await page.waitForURL((url) => url.searchParams.get("page") === "2");
        const readingCard = page
          .locator(".discover .vn-card")
          .filter({ hasText: reading.vn.title });
        await readingCard.locator(".status-playing").waitFor();
        assert.equal(
          await readingCard
            .getByRole("button", { name: "Wishlist", exact: true })
            .count(),
          0,
          "Saved reading entries show their status",
        );
        assert.equal(
          await page.locator(".discover .vn-card").count(),
          6,
          "Catalogue fixture covers a second page",
        );
        await page.goBack();
        await page.waitForURL((url) => !url.searchParams.has("page"));
        await firstCard.locator(".status-wishlist").waitFor();
        await page.goForward();
        await readingCard.locator(".status-playing").waitFor();

        await navigate(page, "Library");
        let saved = await exported(page);
        assert.equal(
          saved.library.find((item) => item.vndbId === "v1").status,
          "wishlist",
        );
        assert.deepEqual(
          personalFields(
            saved.library.find((item) => item.vndbId === reading.vndbId),
          ),
          personalFields(reading),
          "Quick wishlist/reload must preserve the existing tracker",
        );
        const replacement = entry(reading.vn, {
          ...reading,
          progress: 80,
          personalRating: 2,
          notes: "IMPORTED_REPLACEMENT: choose this only when replacing.",
        });
        const replacementProfile = {
          ...preferences,
          tagPreferences: [{ ...preferences.tagPreferences[0], weight: 2 }],
          preferredLengths: [3],
        };
        const replacementChoice = {
          ...savedChoice,
          until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
        const incoming = backup(
          [replacement, entry(titles[34], { status: "backlog" })],
          replacementProfile,
          [replacementChoice],
        );
        await chooseBackup(page, incoming);
        screenshots.push(await snapshot(page, prefix, "backup-preview"));
        await restoreBackup(page, "1 added · 0 replaced · 1 kept");
        saved = await exported(page);
        assert.deepEqual(
          personalFields(
            saved.library.find((item) => item.vndbId === reading.vndbId),
          ),
          personalFields(reading),
          "Default restore preserves private tracker fields",
        );
        assert.deepEqual(
          saved.preferences,
          preferences,
          "Default restore preserves the taste profile",
        );
        assert.deepEqual(
          saved.feedback.find((item) => item.vndbId === savedChoice.vndbId),
          savedChoice,
          "Default restore preserves existing recommendation dismissals",
        );
        await chooseBackup(page, incoming, { overwrite: true, profile: true });
        await restoreBackup(page, "0 added · 2 replaced · 0 kept");
        saved = await exported(page);
        assert.deepEqual(
          personalFields(
            saved.library.find((item) => item.vndbId === reading.vndbId),
          ),
          personalFields(replacement),
          "Explicit replacement restores the complete tracker",
        );
        assert.deepEqual(
          saved.preferences,
          replacementProfile,
          "Explicit profile restoration persists",
        );
        assert.deepEqual(
          saved.feedback.find((item) => item.vndbId === savedChoice.vndbId),
          replacementChoice,
          "Explicit replacement restores recommendation dismissals",
        );
        await navigate(page, "My taste");
        await page
          .locator(".group-love")
          .getByRole("button", {
            name: "Remove Mystery from love tags",
            exact: true,
          })
          .waitFor();
        await page
          .locator(".group-love")
          .getByText("1 tag", { exact: true })
          .waitFor();

        await page.goto(routeUrl());
        const postponed = await hero(page);
        await page
          .getByRole("button", {
            name: /Not tonight/,
          })
          .click();
        await changedHero(page, postponed);
        await page
          .locator(".toast")
          .filter({ hasText: postponed })
          .getByRole("button", { name: "Undo", exact: true })
          .click();
        await page
          .locator(".hero-story h1")
          .filter({ hasText: postponed })
          .waitFor();
        await page
          .getByRole("button", {
            name: /Not tonight/,
          })
          .click();
        await changedHero(page, postponed);
        await page.reload();
        assert.notEqual(
          await hero(page),
          postponed,
          "Not tonight survives reload",
        );
        const hidden = await hero(page);
        await page
          .getByRole("button", { name: "Hide this story", exact: true })
          .click();
        await changedHero(page, hidden);
        await page.reload();
        assert.notEqual(
          await hero(page),
          hidden,
          "Permanent hide survives reload",
        );
        await navigate(page, "My taste");
        const choices = page.locator(".recommendation-choices");
        await choices
          .getByRole("button", { name: `Restore ${hidden}`, exact: true })
          .waitFor();
        screenshots.push(await snapshot(page, prefix, "saved-feedback"));
        await navigate(page, "Library");
        saved = await exported(page);
        const snooze = saved.feedback.find(
          (item) => item.vn.title === postponed,
        );
        assert.ok(
          snooze?.until &&
            Date.parse(snooze.until) - Date.now() > 23 * 60 * 60 * 1000,
          "Not tonight postpones for 24 hours",
        );
        assert.equal(
          saved.feedback.find((item) => item.vn.title === hidden)?.until,
          null,
          "Hide is permanent until restored",
        );
        await navigate(page, "My taste");
        await choices
          .getByRole("button", { name: `Restore ${hidden}`, exact: true })
          .click();
        await choices
          .getByRole("button", { name: `Restore ${hidden}`, exact: true })
          .waitFor({ state: "hidden" });
        await page.goto(routeUrl());
        assert.equal(
          await hero(page),
          hidden,
          "My taste restores the hidden recommendation",
        );
        screenshots.push(await snapshot(page, prefix, "hero-actions"));

        // A direct, reloadable filter link and a separate UI selection exercise
        // both URL hydration and writing routes from the filter controls.
        await page.goto(
          routeUrl({
            view: "discover",
            language: "en",
            tag: "g1",
            tagName: "Mystery",
          }),
        );
        await page
          .getByRole("button", { name: "Remove filter: English", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Remove filter: Mystery", exact: true })
          .waitFor();
        await openFilters(page);
        assert.equal(
          await page.getByRole("combobox", { name: /Language/ }).inputValue(),
          "en",
        );
        await page
          .getByRole("button", { name: "Remove filter: Mystery", exact: true })
          .click();
        await page.locator(".theme-filter").click();
        const index = page.getByRole("dialog", { name: "VNDB tag index" });
        await index
          .locator(".tag-row")
          .filter({ hasText: "Mystery" })
          .getByRole("button", { name: "Find stories", exact: true })
          .click();
        await index.waitFor({ state: "hidden" });
        await page.waitForURL((url) => url.searchParams.get("tag") === "g1");
        await page
          .getByRole("combobox", { name: /Language/ })
          .selectOption("ja");
        await page.waitForURL(
          (url) => url.searchParams.get("language") === "ja",
        );
        await page.waitForFunction(
          () => document.querySelectorAll(".discover .vn-card").length === 4,
        );
        await page
          .getByRole("combobox", { name: /Language/ })
          .selectOption("en");
        await page.waitForURL(
          (url) => url.searchParams.get("language") === "en",
        );
        await page.reload();
        await page
          .getByRole("button", { name: "Remove filter: Mystery", exact: true })
          .waitFor();
        assert.ok(
          searches.some(
            (search) => search.language === "en" && search.tag === "g1",
          ),
          "Language and theme reach the catalogue query",
        );
        const storyCard = page.locator(".discover .vn-card").filter({
          has: page.getByRole("heading", {
            name: titles[1].title,
            exact: true,
          }),
        });
        await storyCard.locator(".card-open-button").press("Enter");
        const detail = page.getByRole("dialog", {
          name: titles[1].title,
          exact: true,
        });
        await detail.waitFor();
        await page.waitForURL((url) => url.searchParams.get("vn") === "v2");
        await detail
          .getByRole("button", { name: "Rate Mystery (loved)", exact: true })
          .click();
        const tune = page.getByRole("group", {
          name: "Tune Mystery",
          exact: true,
        });
        assert.equal(
          await tune
            .getByRole("button", {
              name: "Remove Mystery as love",
              exact: true,
            })
            .getAttribute("aria-pressed"),
          "true",
          "Restored intermediate weights appear in their selected taste group",
        );
        await page.keyboard.press("Escape");
        await tune.waitFor({ state: "hidden" });
        await detail
          .getByRole("button", { name: "Copy story link", exact: true })
          .click();
        await page.getByText("Story link copied", { exact: true }).waitFor();
        const copied = new URL(
          await page.evaluate(() => navigator.clipboard.readText()),
        );
        assert.equal(copied.origin, base.origin);
        assert.equal(copied.pathname, base.pathname);
        assert.deepEqual(
          [...copied.searchParams],
          [["vn", "v2"]],
          "Copied story links contain no private or filter data",
        );
        assert.equal(copied.hash, "");
        await page.goBack();
        await detail.waitFor({ state: "hidden" });
        assert.equal(new URL(page.url()).searchParams.get("tag"), "g1");
        await page.goForward();
        await detail.waitFor();
        await detail
          .getByRole("button", { name: "Close details", exact: true })
          .click();
        await detail.waitFor({ state: "hidden" });
        assert.equal(new URL(page.url()).searchParams.get("language"), "en");
        await page.goto(copied.href);
        await detail.waitFor();
        await detail
          .getByRole("button", { name: "Close details", exact: true })
          .click();
        await detail.waitFor({ state: "hidden" });
        assert.equal(
          new URL(page.url()).search,
          "",
          "A shared story link opens directly and closes to Home",
        );

        await navigate(page, "Library");
        await page
          .getByRole("group", { name: "Library status" })
          .getByRole("button", { name: /^Reading/ })
          .click();
        await page
          .getByRole("textbox", { name: "Search your library", exact: true })
          .fill(reading.vn.title);
        await page
          .getByRole("button", { name: "Favorites", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: /Sort by/ })
          .selectOption("progress");
        await page.waitForURL(
          (url) =>
            url.searchParams.get("filter") === "playing" &&
            url.searchParams.get("favorites") === "1" &&
            url.searchParams.get("sort") === "progress",
        );
        await page.reload();
        await page
          .locator(".ledger-row")
          .filter({ hasText: reading.vn.title })
          .waitFor();
        assert.equal(await page.locator(".ledger-row").count(), 1);
        assert.equal(
          await page
            .getByRole("textbox", { name: "Search your library" })
            .inputValue(),
          reading.vn.title,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Favorites", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        assert.equal(
          await page.getByRole("combobox", { name: /Sort by/ }).inputValue(),
          "progress",
        );
        screenshots.push(await snapshot(page, prefix, "saved-library-filters"));
        assert.deepEqual(
          violations,
          [],
          "No unmocked/personal network requests are allowed",
        );
        assert.deepEqual(errors, [], "No browser page errors");
        await rm(path.join(out, `${prefix}-failure.png`), { force: true });
        results.push({
          viewport: width,
          theme,
          storage,
          checks: [
            "atomic wishlist and reload",
            "existing tracker preserved",
            "backup default preserve",
            "backup explicit overwrite/profile",
            "restored profile visible in Taste and detail choices",
            "feedback undo/persistence/restore",
            "language and theme URL filters",
            "pagination and detail history",
            "clean copied link",
            "saved library filters",
            "no overflow/page errors",
          ],
          screenshots,
        });
      } catch (error) {
        await page
          .screenshot({
            path: path.join(out, `${prefix}-failure.png`),
            fullPage: true,
          })
          .catch(() => {});
        console.error(
          JSON.stringify(
            { prefix, url: page.url(), errors, violations },
            null,
            2,
          ),
        );
        throw error;
      } finally {
        await context.close();
      }
    }
  }
  await writeFile(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({ passed: results.length, storage, out, results }, null, 2),
  );
} finally {
  await browser.close();
}
