import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadDotEnv } from "../cli/env.ts";
import { createRuntime } from "../runtime.ts";
import { createApp } from "./app.ts";

loadDotEnv();
const ctx = createRuntime();
const app = createApp(ctx);
const webRoot = fileURLToPath(new URL("../../dist/web", import.meta.url));

if (existsSync(webRoot)) {
  const index = readFileSync(`${webRoot}/index.html`, "utf8");
  const conta = readFileSync(`${webRoot}/conta.html`, "utf8");
  const customerHost = new URL(ctx.config.customerPublicUrl).host.toLowerCase();
  app.use("/assets/*", serveStatic({ root: webRoot }));
  app.use("/favicon.svg", serveStatic({ root: webRoot }));
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/webhooks/")) return c.notFound();
    return c.html(new URL(c.req.url).host.toLowerCase() === customerHost ? conta : index);
  });
}

const port = Number(process.env.PORT) || 8790;
const hostname = process.env.HOST || "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`[admin] API em http://${hostname}:${port}${existsSync(webRoot) ? " (servindo o painel de dist/web)" : ""}`);
});
