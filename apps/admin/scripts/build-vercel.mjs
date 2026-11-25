// Builds .vercel/output (Vercel Build Output API v3): the panel as static files and the whole
// API (Hono) as one Node.js function that also receives /webhooks/* and the cron tick.
// Run after `vite build` (pnpm build:vercel does both).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
// The static pages are told apart by host at the edge; the default matches the server's production default.
const customerHost = new URL(process.env.CUSTOMER_PUBLIC_URL?.trim() || "https://conta.arkobot.com.br").host.toLowerCase();
const output = join(root, ".vercel", "output");
const web = join(root, "dist", "web");
if (!existsSync(join(web, "index.html")) || !existsSync(join(web, "conta.html"))) throw new Error("Rode `pnpm build` antes: dist/web não existe.");

rmSync(output, { recursive: true, force: true });
cpSync(web, join(output, "static"), { recursive: true });

const fn = join(output, "functions", "api.func");
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, "src", "server", "vercel.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // pg's optional native binding is never used.
  external: ["pg-native"],
  // CommonJS dependencies (pg, qrcode) call require() inside the ESM bundle.
  banner: { js: "import { createRequire as __arkoCreateRequire } from 'node:module'; const require = __arkoCreateRequire(import.meta.url);" },
  legalComments: "none",
});
writeFileSync(join(fn, ".vc-config.json"), JSON.stringify({
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  maxDuration: 60,
}, null, 2));

const pageHeaders = { "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" };
writeFileSync(join(output, "config.json"), JSON.stringify({
  version: 3,
  routes: [
    { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
    { src: "^/(api|webhooks)(/.*)?$", dest: "/api" },
    { src: "^/(index\\.html)?$", has: [{ type: "host", value: customerHost }], dest: "/conta.html", headers: pageHeaders },
    { handle: "filesystem" },
    { src: "^/(.*)$", has: [{ type: "host", value: customerHost }], dest: "/conta.html", headers: pageHeaders },
    { src: "^/(.*)$", dest: "/index.html", headers: pageHeaders },
  ],
  crons: [{ path: "/api/cron/tick", schedule: "*/5 * * * *" }],
}, null, 2));

console.log(`Vercel Build Output em ${output}`);
