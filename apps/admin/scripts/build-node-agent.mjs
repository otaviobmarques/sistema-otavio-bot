// Bundles the node agent (src/node-agent/main.ts) into one file, dist/node-agent/agent.mjs, that runs with plain Node 22+
// and no node_modules: what the agent's container image ships.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "dist", "node-agent");
mkdirSync(out, { recursive: true });
for (const [source, file] of [["main.ts", "agent.mjs"], ["relay.ts", "relay.mjs"], ["task-helper.ts", "task-helper.mjs"]]) {
  await build({
    entryPoints: [join(root, "src", "node-agent", source)],
    outfile: join(out, file),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    legalComments: "none",
  });
  console.log(`Agente em ${join(out, file)}`);
}
