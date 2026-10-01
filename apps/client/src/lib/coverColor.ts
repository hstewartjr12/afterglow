import { useEffect, useState } from "react";

/**
 * Covers are served through the local API so the browser may read their pixels.
 * Anything that is not a VNDB image is used as is.
 */
export function coverSrc(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host === "vndb.org" || host.endsWith(".vndb.org"))
      return `/api/cover?url=${encodeURIComponent(url)}`;
  } catch {
    // Relative or malformed URLs fall through unchanged.
  }
  return url;
}

/** Downloads a cover ahead of time, so the page that shows it paints at once. */
export function warmCover(url: string) {
  const img = new Image();
  img.decoding = "async";
  img.src = coverSrc(url);
}

/** A cover's color, pre-adjusted to read well as text on each theme. */
export type CoverTint = { light: string; dark: string };

const cache = new Map<string, CoverTint | null>();
const STORAGE_KEY = "afterglow-cover-tints";
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  for (const [url, tint] of Object.entries(saved))
    cache.set(url, tint as CoverTint | null);
} catch {
  // A missing or unreadable cache just means colors are sampled again.
}
let persistTimer: ReturnType<typeof setTimeout> | undefined;
/** Covers are often sampled a grid at a time, so write the cache once they settle. */
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(save, 1000);
}
function save() {
  try {
    const recent = [...cache.entries()].slice(-300);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(recent)),
    );
  } catch {
    // Storage may be full or unavailable; the in-memory cache still works.
  }
}

function hslToRgb(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
function luminance([r, g, b]: number[]) {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
// The page and card backgrounds of each theme (--bg light, --surface dark).
const LIGHT_BG = luminance([0xf3 / 255, 0xee / 255, 0xe4 / 255]);
const DARK_BG = luminance([0x1a / 255, 0x1c / 255, 0x28 / 255]);

/** Walk lightness until the color passes 4.5:1 against the theme background. */
function readable(
  h: number,
  s: number,
  start: number,
  step: number,
  bg: number,
) {
  let l = start;
  while (
    l > 0.05 &&
    l < 0.95 &&
    contrast(luminance(hslToRgb(h, s, l)), bg) < 4.5
  )
    l += step;
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/**
 * The cover's most characteristic color: pixels are grouped by hue and weighted
 * by how vivid they are, so a small bright accent beats a large gray area.
 */
export function sampleTint(img: CanvasImageSource): CoverTint | null {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, size, size);
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // A cross-origin image cannot be read.
  }
  const bins = Array.from({ length: 24 }, () => ({
    weight: 0,
    x: 0,
    y: 0,
    s: 0,
  }));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 0.08 || l < 0.12 || l > 0.92) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const weight = s * (1 - Math.abs(2 * l - 1));
    const bin = bins[Math.floor(h / 15) % 24];
    bin.weight += weight;
    bin.x += Math.cos((h * Math.PI) / 180) * weight;
    bin.y += Math.sin((h * Math.PI) / 180) * weight;
    bin.s += s * weight;
  }
  const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a));
  // Mostly gray or monochrome covers keep the app's own accent.
  if (best.weight < 12) return null;
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  const saturation = Math.max(0.35, Math.min(0.75, best.s / best.weight));
  return {
    light: readable(hue, saturation, 0.45, -0.02, LIGHT_BG),
    dark: readable(hue, saturation, 0.65, 0.02, DARK_BG),
  };
}

const waiting = new Map<string, Set<(tint: CoverTint | null) => void>>();
const idle = (run: () => void) =>
  "requestIdleCallback" in window
    ? requestIdleCallback(run, { timeout: 1000 })
    : setTimeout(run, 50);

/**
 * A sampling-sized copy of a cover. Drawing the full image onto a canvas would
 * decode it again on the main thread; an image bitmap is decoded and scaled
 * off it where the browser supports that.
 */
const shrink = (img: HTMLImageElement): Promise<CanvasImageSource> =>
  typeof createImageBitmap === "function"
    ? createImageBitmap(img, {
        resizeWidth: 32,
        resizeHeight: 32,
        resizeQuality: "low",
      }).catch(() => img)
    : Promise.resolve(img);

/**
 * Samples a cover from an image the page has already loaded, so tints cost no
 * extra download. Sampling waits for idle time, keeping it out of animations.
 */
export function sampleCover(url: string, img: HTMLImageElement) {
  if (cache.has(url)) return;
  // React can reuse this image for another story before the idle task runs.
  const source = img.src;
  if (source !== new URL(coverSrc(url), document.baseURI).href) return;
  (img.decode ? img.decode() : Promise.resolve()).then(
    () =>
      idle(() => {
        if (
          cache.has(url) ||
          img.src !== source ||
          !img.complete ||
          !img.naturalWidth
        )
          return;
        void shrink(img).then((small) => {
          if (cache.has(url)) return;
          const tint = sampleTint(small);
          cache.set(url, tint);
          persist();
          waiting.get(url)?.forEach((notify) => notify(tint));
          waiting.delete(url);
        });
      }),
    () => {},
  );
}

/** The tint for a cover shown on screen, sampled once and remembered across visits. */
export function useCoverTint(url: string | null | undefined) {
  const [sampled, setSampled] = useState<{
    url: typeof url;
    tint: CoverTint | null;
  }>(() => ({ url, tint: url ? (cache.get(url) ?? null) : null }));
  useEffect(() => {
    if (!url || cache.has(url)) return;
    const notify = (tint: CoverTint | null) => setSampled({ url, tint });
    const listeners = waiting.get(url) ?? new Set();
    waiting.set(url, listeners.add(notify));
    return () => {
      listeners.delete(notify);
      if (!listeners.size && waiting.get(url) === listeners)
        waiting.delete(url);
    };
  }, [url]);
  if (!url) return null;
  return cache.has(url)
    ? cache.get(url)!
    : sampled.url === url
      ? sampled.tint
      : null;
}

/** CSS variables that switch a `.tinted` region to the cover's colors. */
export function tintStyle(tint: CoverTint | null): React.CSSProperties {
  return tint
    ? ({
        "--tint-light": tint.light,
        "--tint-dark": tint.dark,
      } as React.CSSProperties)
    : {};
}
