import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import worker from "../dist/server/index.js";
const root = path.resolve("dist/client");
const port = Number(process.env.PORT || 5174);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      let filename;
      try {
        filename = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      } catch {
        return new Response("Bad path", { status: 400 });
      }
      if (filename !== root && !filename.startsWith(root + path.sep))
        return new Response("Not found", { status: 404 });
      let body;
      try {
        body = await readFile(filename);
      } catch {
        if (path.extname(url.pathname))
          return new Response("Not found", { status: 404 });
        filename = path.join(root, "index.html");
        body = await readFile(filename);
      }
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "Content-Type":
            types[path.extname(filename)] || "application/octet-stream",
        },
      });
    },
  },
};
const server = createServer(async (req, res) => {
  try {
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers: req.headers,
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Preview error");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
