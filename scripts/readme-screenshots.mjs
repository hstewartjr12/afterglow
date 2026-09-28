#!/usr/bin/env node
/**
 * Regenerates the README screenshots from your own running Afterglow, so they
 * show real covers and recommendations.
 *
 *   npm run build && npm start        # in one terminal
 *   npm run screenshots               # in another
 *
 * Options: --url=http://127.0.0.1:3001  --theme=light|dark  --out=docs/images
 * The first run may ask you to install Chromium: npx playwright install chromium
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const shots = [
  {
    file: "afterglow-discover.jpg",
    what: "Home: your next story and why it fits",
    async prepare(page) {
      if (await page.locator(".onboarding").count())
        console.warn(
          "  ! Your taste profile is empty, so Home shows the first-run tag picker.\n" +
            "    Add a few tags in My taste (and some library entries) for a better shot.",
        );
      if (!(await page.locator(".hero").count()))
        throw new Error(
          "Home has no recommendation to feature. Is VNDB reachable, and is your taste profile set up?",
        );
      // Finish the typewriter text and let the match ring settle.
      await page.locator(".hero .vn-box").click();
      await page.waitForTimeout(1500);
    },
  },
  {
    file: "afterglow-taste.jpg",
    what: "My taste: weighted VNDB tags",
    async prepare(page) {
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("button", { name: "My taste" })
        .click();
      await page.getByRole("heading", { name: /your taste/i }).waitFor();
      // Let the page-change eyecatch finish.
      await page.waitForTimeout(1500);
    },
  },
];

/** Waits until fonts and every visible cover image have finished loading. */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () => [...document.images].every((img) => img.complete),
      null,
      { timeout: 20_000 },
    )
    .catch(() => console.warn("  ! Some covers did not finish loading."));
}

export async function captureScreenshots({
  browser,
  baseUrl = "http://127.0.0.1:3001",
  outDir = path.join(root, "docs/images"),
  theme = "light",
  preparePage,
}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  await preparePage?.(page);
  try {
    await page.goto(baseUrl);
  } catch {
    throw new Error(
      `Could not open ${baseUrl}. Start Afterglow first: npm run build && npm start`,
    );
  }
  const written = [];
  for (const shot of shots) {
    console.log(`- ${shot.what}`);
    await settle(page);
    await shot.prepare(page);
    await settle(page);
    await page.mouse.move(0, 0);
    const file = path.join(outDir, shot.file);
    await page.screenshot({ path: file, type: "jpeg", quality: 82 });
    written.push(file);
  }
  await context.close();
  return written;
}

async function main() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .map((arg) => arg.replace(/^--/, "").split("="))
      .map(([key, value]) => [key, value ?? "true"]),
  );
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is not installed yet. Run npm install, then npx playwright install chromium.",
    );
  }
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    console.error(
      "Chromium is not installed for Playwright yet. Run: npx playwright install chromium",
    );
    throw error;
  }
  try {
    const files = await captureScreenshots({
      browser,
      baseUrl: args.url,
      outDir: args.out ? path.resolve(args.out) : undefined,
      theme: args.theme === "dark" ? "dark" : "light",
    });
    console.log(
      `\nSaved:\n${files.map((f) => `  ${path.relative(process.cwd(), f)}`).join("\n")}` +
        "\nThey show your real library and taste profile, so check them before committing.",
    );
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
