// Local development: the API (node --watch) on :8790 and Vite on :5190, which proxies /api and /webhooks.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const children = [
  spawn(process.execPath, ["--watch", "src/server/node.ts"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))], { cwd: root, stdio: "inherit" }),
];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && stop());
