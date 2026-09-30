import { spawn } from "node:child_process";
const build = spawn("npm", ["run", "build"], { stdio: "inherit" });
const code = await new Promise((resolve) => build.on("exit", resolve));
if (code !== 0) process.exit(code || 1);
const preview = spawn(process.execPath, ["scripts/preview.mjs"], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => preview.kill(signal));
preview.on("exit", (code) => process.exit(code || 0));
