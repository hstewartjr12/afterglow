import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = process.env.DEMO_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.url().startsWith(origin + "/api/"))
    requests.push({ url: request.url(), body: request.postData() });
});
const readStore = async (name, key) =>
  page.evaluate(
    ({ name, key }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("afterglow-demo-v1", 1);
        open.onerror = () => reject(open.error?.message);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(name);
          const request = key
            ? tx.objectStore(name).get(key)
            : tx.objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          tx.oncomplete = () => db.close();
        };
      }),
    { name, key },
  );
async function untilStored(name, predicate, key) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await readStore(name, key);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Expected browser data was not saved");
}
try {
  await mkdir("outputs", { recursive: true });
  await page.goto(origin);
  await page.locator("#hero-title").waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "Mystery", exact: true }).click();
  const updatedCandidates = page.waitForResponse((response) =>
    response.url().includes("/api/vndb/candidates?tags=g"),
  );
  await page.getByRole("button", { name: "Save 1 theme", exact: true }).click();
  await updatedCandidates;
  await page.waitForTimeout(1000);
  await untilStored(
    "settings",
    (value) =>
      value?.completed &&
      value.tagPreferences.some((tag) => tag.name === "Mystery"),
    "preferences",
  );
  await page.locator(".onboarding").waitFor({ state: "hidden" });
  await page.locator(".hero-cover img.is-loaded").waitFor({ timeout: 45000 });
  const title = await page.locator("#hero-title").innerText();
  await page.getByRole("button", { name: "Open story", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog
    .getByRole("textbox", { name: /Private notes/ })
    .fill("Browser-only demo verification note");
  await dialog.getByRole("radio", { name: "Reading", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Rate 9 out of 10", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  const saved = await untilStored(
    "library",
    (value) =>
      value.length === 1 &&
      value[0].notes === "Browser-only demo verification note",
  );
  assert.equal(saved[0].status, "playing");
  assert.equal(saved[0].personalRating, 9);
  assert.equal(saved[0].favorite, true);
  await dialog
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("heading", { name: "The stories you carry." }).waitFor();
  assert.ok(
    (await page.locator("main").innerText())
      .toLowerCase()
      .includes(saved[0].vn.title.toLowerCase()),
  );
  await page.reload();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("heading", { name: "The stories you carry." }).waitFor();
  await page.waitForTimeout(600);
  await page
    .getByRole("button", {
      name: new RegExp(
        `Continue ${saved[0].vn.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: /Private notes/ })
    .waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: /Private notes/ }).inputValue(),
    "Browser-only demo verification note",
  );
  await page
    .getByRole("textbox", { name: /Private notes/ })
    .fill("Updated browser-only note");
  await untilStored(
    "library",
    (value) => value[0]?.notes === "Updated browser-only note",
  );
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.getByRole("button", { name: "My taste", exact: true }).click();
  await page.getByRole("checkbox", { name: "Windows", exact: true }).check();
  await page
    .getByRole("button", { name: "Save taste profile", exact: true })
    .click();
  await untilStored(
    "settings",
    (value) => value.preferredPlatforms.includes("win"),
    "preferences",
  );
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search the catalogue", exact: true })
    .fill("Steins;Gate");
  await page
    .getByRole("heading", { name: /STEINS;GATE/i })
    .first()
    .waitFor({ timeout: 45000 });
  await page
    .getByRole("button", { name: "Afterglow アフターグロウ", exact: true })
    .click();
  await page.locator("#hero-title").waitFor();
  await page.waitForTimeout(1000);
  await page.locator(".hero-cover img.is-loaded").waitFor({ timeout: 45000 });
  await page.screenshot({ path: "outputs/demo-desktop.png", fullPage: false });
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const mobile = await other.newPage();
  await mobile.goto(origin);
  await mobile.locator("#hero-title").waitFor({ timeout: 45000 });
  await mobile
    .getByRole("button", { name: "Skip for now", exact: true })
    .click();
  await mobile.locator(".onboarding").waitFor({ state: "hidden" });
  await mobile.locator(".hero-cover img.is-loaded").waitFor({ timeout: 45000 });
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await mobile
    .getByRole("button", { name: "Dark theme", exact: true })
    .count()
    .then(async (count) => {
      if (count === 0)
        await mobile.getByRole("button", { name: "Open navigation" }).click();
    });
  await mobile.getByRole("button", { name: "Dark theme", exact: true }).click();
  if (await mobile.getByRole("button", { name: "Close navigation" }).count())
    await mobile
      .getByRole("button", { name: "Close navigation" })
      .last()
      .click();
  await mobile.waitForTimeout(700);
  await mobile.screenshot({
    path: "outputs/demo-mobile-dark.png",
    fullPage: false,
  });
  await mobile.getByRole("button", { name: "Open navigation" }).click();
  await mobile.getByRole("button", { name: "Library", exact: true }).click();
  await mobile
    .getByRole("heading", { name: "The stories you carry." })
    .waitFor();
  await mobile
    .getByRole("heading", { name: "Your shelf is waiting." })
    .waitFor();
  await other.close();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("heading", { name: "What do you love in a story?" })
    .waitFor();
  assert.deepEqual(await readStore("library"), []);
  assert.equal(await readStore("settings", "preferences"), undefined);
  assert.deepEqual(errors, []);
  assert.ok(
    !requests.some((r) =>
      /\/api\/(library|preferences|recommendations)(\/|\?|$)/.test(r.url),
    ),
  );
  assert.ok(
    !requests.some(
      (r) =>
        r.body?.includes("verification note") ||
        r.url.includes("verification%20note"),
    ),
  );
  console.log(
    JSON.stringify({
      passed: [
        "live VNDB search",
        "theme onboarding",
        "save and reload library",
        "notes autosave",
        "save taste profile",
        "separate visitor data",
        "reset",
        "mobile layout",
        "dark theme",
        "no personal-data server requests",
      ],
      title,
      pageErrors: errors,
      screenshots: ["outputs/demo-desktop.png", "outputs/demo-mobile-dark.png"],
    }),
  );
} catch (error) {
  await page.screenshot({
    path: "outputs/browser-failure.png",
    fullPage: false,
  });
  console.log(
    JSON.stringify({
      text: (await page.locator("body").innerText()).slice(-8000),
      errors,
    }),
  );
  throw error;
} finally {
  await browser.close();
}
