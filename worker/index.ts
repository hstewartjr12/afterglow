import { z } from "zod";
import { languages } from "@afterglow/shared/constants";
import { platformSchema } from "@afterglow/shared";
import {
  fetchCover,
  getVn,
  isCoverUrl,
  personalizedVns,
  searchTags,
  searchVns,
} from "./vndb";
type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };
const idSchema = z.string().regex(/^v\d+$/);
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/")) {
    if (!["GET", "HEAD"].includes(request.method))
      return json({ error: "Method not allowed" }, 405);
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    if (headers.get("Content-Type")?.includes("text/html"))
      headers.set("Cache-Control", "no-cache");
    return new Response(asset.body, { status: asset.status, headers });
  }
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  const optional = (key: string) => url.searchParams.get(key) || undefined;
  const page = () =>
    z.coerce.number().int().min(1).max(1000).default(1).parse(optional("page"));
  if (path === "/api/health") return json({ ok: true, storage: "browser" });
  if (path === "/api/vndb/search") {
    return json(
      await searchVns({
        q: z.string().max(100).default("").parse(optional("q")),
        page: page(),
        platform: platformSchema.optional().parse(optional("platform")),
        language: z
          .string()
          .refine((value) => languages.includes(value), "Invalid language")
          .optional()
          .parse(optional("language")),
        tag: z
          .string()
          .regex(/^g\d+$/)
          .optional()
          .parse(optional("tag")),
        length: z.coerce
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .parse(optional("length")),
        year: z.coerce
          .number()
          .int()
          .min(1980)
          .max(new Date().getFullYear())
          .optional()
          .parse(optional("year")),
        rating: z.coerce
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .parse(optional("rating")),
        sort: z
          .enum(["rating", "released", "votecount", "title", "searchrank"])
          .optional()
          .parse(optional("sort")),
      }),
    );
  }
  if (path === "/api/vndb/tags")
    return json(
      await searchTags(
        z.string().max(100).default("").parse(optional("q")),
        page(),
        z.enum(["cont", "ero", "tech"]).optional().parse(optional("category")),
      ),
    );
  if (path === "/api/vndb/candidates") {
    const raw = z.string().max(100).default("").parse(optional("tags"));
    const tags = z
      .array(z.string().regex(/^g\d+$/))
      .max(8)
      .parse(raw ? raw.split(",") : []);
    const spoilers =
      z.enum(["0", "1"]).default("0").parse(optional("spoilers")) === "1";
    return json(
      await personalizedVns(
        tags,
        spoilers,
        z.coerce
          .number()
          .int()
          .min(1)
          .max(3)
          .default(1)
          .parse(optional("page")),
      ),
    );
  }
  if (path.startsWith("/api/vndb/vn/")) {
    const vn = await getVn(idSchema.parse(path.slice("/api/vndb/vn/".length)));
    return vn ? json(vn) : json({ error: "Visual novel not found" }, 404);
  }
  if (path === "/api/cover") {
    const coverUrl = z.string().max(500).parse(optional("url"));
    if (!isCoverUrl(coverUrl))
      return json({ error: "Only VNDB covers can be loaded" }, 400);
    const cover = await fetchCover(coverUrl);
    return new Response(cover.body, {
      headers: {
        "Content-Type": cover.type,
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return json({ error: "Not found" }, 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof z.ZodError)
        return json(
          { error: error.issues[0]?.message ?? "Invalid request" },
          400,
        );
      const upstream = error as {
        status?: number;
        upstream?: boolean;
        message?: string;
      };
      if (upstream.upstream)
        return json(
          { error: upstream.message ?? "VNDB could not be reached." },
          upstream.status === 429 ? 429 : 502,
        );
      console.error(
        "Catalogue request failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};
