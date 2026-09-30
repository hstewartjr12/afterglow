import { build } from "esbuild";
await build({
  entryPoints: ["worker/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
