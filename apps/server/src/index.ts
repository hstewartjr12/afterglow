import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import {
  libraryInputSchema,
  platformSchema,
  preferencesSchema,
  vnSummarySchema,
  type LibraryEntry,
  type Preferences,
} from "@afterglow/shared";
import { db } from "./db.js";
import { appSettings, libraryEntries } from "./schema.js";
import { getVn, personalizedVns, searchTags, searchVns } from "./vndb.js";
import { rankRecommendations } from "./recommend.js";

const PORT = Number(process.env.PORT) || 3001;
// No accounts protect this API, so only listen on this machine unless asked otherwise.
const HOST = process.env.HOST || "127.0.0.1";

const vndbId = z.string().regex(/^v\d+$/);
const optional = (value: unknown) => value || undefined;

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

function serialize(r: typeof libraryEntries.$inferSelect): LibraryEntry {
  return {
    id: r.id,
    vndbId: r.vndbId,
    status: r.status as LibraryEntry["status"],
    personalRating: r.personalRating,
    favorite: Boolean(r.favorite),
    progress: r.progress,
    notes: r.notes,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    vn: JSON.parse(r.vnJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const defaults: Preferences = {
  tagPreferences: [],
  preferredLengths: [],
  preferredPlatforms: [],
  useSpoilerTagsInRecommendations: false,
  completed: false,
};
async function readPreferences(): Promise<Preferences> {
  const row = (
    await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "preferences"))
  )[0];
  if (!row) return defaults;
  // A stored profile from an older schema should not break every recommendation request.
  try {
    const parsed = preferencesSchema.safeParse(JSON.parse(row.value));
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to the defaults below.
  }
  console.warn("Ignoring unreadable saved preferences");
  return defaults;
}
async function readLibrary() {
  return (await db.select().from(libraryEntries)).map(serialize);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/vndb/search", async (req, res) => {
  const q = z.string().max(100).default("").parse(req.query.q);
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
  const platform = platformSchema
    .optional()
    .parse(optional(req.query.platform));
  const length = z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .parse(optional(req.query.length));
  const year = z.coerce
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear())
    .optional()
    .parse(optional(req.query.year));
  const rating = z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .parse(optional(req.query.rating));
  const sort = z
    .enum(["rating", "released", "votecount", "title", "searchrank"])
    .optional()
    .parse(optional(req.query.sort));
  res.json(await searchVns({ q, page, platform, length, year, rating, sort }));
});

app.get("/api/vndb/tags", async (req, res) => {
  const q = z.string().max(100).default("").parse(req.query.q);
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
  const category = z
    .enum(["cont", "ero", "tech"])
    .optional()
    .parse(optional(req.query.category));
  res.json(await searchTags(q, page, category));
});

app.get("/api/vndb/vn/:id", async (req, res) => {
  const vn = await getVn(vndbId.parse(req.params.id));
  if (!vn) {
    res
      .status(404)
      .json({ error: "Visual novel not found", code: "NOT_FOUND" });
    return;
  }
  res.json(vn);
});

app.get("/api/library", async (_req, res) => {
  const rows = await db
    .select()
    .from(libraryEntries)
    .orderBy(desc(libraryEntries.updatedAt));
  res.json(rows.map(serialize));
});

app.put("/api/library/:vndbId", async (req, res) => {
  const id = vndbId.parse(req.params.vndbId);
  const input = libraryInputSchema.parse(req.body);
  const now = new Date().toISOString();
  const fields = {
    status: input.status,
    personalRating: input.personalRating,
    favorite: input.favorite,
    progress: input.progress,
    notes: input.notes,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    vnJson: JSON.stringify(input.vn),
    updatedAt: now,
  };
  const [row] = await db
    .insert(libraryEntries)
    .values({ vndbId: id, createdAt: now, ...fields })
    .onConflictDoUpdate({ target: libraryEntries.vndbId, set: fields })
    .returning();
  res.json(serialize(row));
});

app.delete("/api/library/:vndbId", async (req, res) => {
  await db
    .delete(libraryEntries)
    .where(eq(libraryEntries.vndbId, vndbId.parse(req.params.vndbId)));
  res.status(204).end();
});

app.get("/api/preferences", async (_req, res) => {
  res.json(await readPreferences());
});

app.put("/api/preferences", async (req, res) => {
  const p = preferencesSchema.parse(req.body);
  const value = JSON.stringify(p);
  await db
    .insert(appSettings)
    .values({ key: "preferences", value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  res.json(p);
});

app.get("/api/recommendations", async (_req, res) => {
  const [library, prefs] = await Promise.all([
    readLibrary(),
    readPreferences(),
  ]);
  const positiveIds = prefs.tagPreferences
    .filter((p) => p.weight > 0 && /^g\d+$/.test(p.id))
    .sort((a, b) => b.weight - a.weight)
    .map((p) => p.id);
  const candidates = await personalizedVns(
    positiveIds,
    prefs.useSpoilerTagsInRecommendations,
  );
  res.json(rankRecommendations(candidates, library, prefs));
});

app.post("/api/recommendations/score", async (req, res) => {
  const vns = z.array(vnSummarySchema).max(30).parse(req.body?.vns);
  const [library, prefs] = await Promise.all([
    readLibrary(),
    readPreferences(),
  ]);
  res.json(rankRecommendations(vns, library, prefs, false, vns.length));
});

app.get("/api/recommendations/:id", async (req, res) => {
  const vn = await getVn(vndbId.parse(req.params.id));
  if (!vn) {
    res
      .status(404)
      .json({ error: "Visual novel not found", code: "NOT_FOUND" });
    return;
  }
  const [library, prefs] = await Promise.all([
    readLibrary(),
    readPreferences(),
  ]);
  res.json(rankRecommendations([vn], library, prefs, false)[0]);
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

// Serve the built client when it exists, so `npm run build && npm start` is a complete app.
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist",
);
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(clientDist, "index.html")),
  );
}

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.issues[0]?.message ?? "Invalid request",
        code: "VALIDATION_ERROR",
      });
      return;
    }
    const status = Number(err?.status ?? err?.statusCode);
    if (status === 429) {
      res.status(429).json({ error: err.message, code: "RATE_LIMITED" });
      return;
    }
    // Client errors raised by middleware (e.g. malformed JSON bodies) are not upstream failures.
    if (status >= 400 && status < 500 && err?.expose) {
      res
        .status(status)
        .json({ error: "The request could not be read.", code: "BAD_REQUEST" });
      return;
    }
    console.error(err);
    if (err?.upstream) {
      res.status(502).json({ error: err.message, code: "UPSTREAM_ERROR" });
      return;
    }
    res
      .status(500)
      .json({ error: "Something went wrong.", code: "INTERNAL_ERROR" });
  },
);

app.listen(PORT, HOST, () =>
  console.log(`Afterglow API at http://${HOST}:${PORT}`),
);
