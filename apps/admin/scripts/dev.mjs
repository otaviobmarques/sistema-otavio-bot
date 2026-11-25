// Local development: the API (node --watch) on :8790, Vite on :5190 for the panel and on :5191 for the
// customer area (CUSTOMER_PUBLIC_URL), both proxying /api and /webhooks with the browser's Host header.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const customerPort = new URL(process.env.CUSTOMER_PUBLIC_URL || "http://localhost:5191").port || "5191";
const children = [
  spawn(process.execPath, ["--watch", "src/server/node.ts"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [vite], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [vite], { cwd: root, stdio: "inherit", env: { ...process.env, ADMIN_WEB_PORT: customerPort } }),
];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && stop());
