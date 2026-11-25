// Bundles the AI gateway (src/gateway/node.ts) into one file, dist/gateway/gateway.mjs, that runs with plain Node 22+
// and no node_modules: what the gateway's container image ships.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "dist", "gateway");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(root, "src", "gateway", "node.ts")],
  outfile: join(out, "gateway.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // pg's optional native binding is never used.
  external: ["pg-native"],
  // CommonJS dependencies (pg) call require() inside the ESM bundle.
  banner: { js: "import { createRequire as __arkoCreateRequire } from 'node:module'; const require = __arkoCreateRequire(import.meta.url);" },
  legalComments: "none",
});
console.log(`Gateway em ${join(out, "gateway.mjs")}`);
