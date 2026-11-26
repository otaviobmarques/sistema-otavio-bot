// ArkoBot never sends data to, or fetches from, the servers of the project it is built on, and never sends people to
// that project's site. Tests, fixtures, test vectors and that project's own deploy configs may still name them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ROOTS = ["electron", "server", "src", "shared", "companion/src", "connector", "deploy", "electron-builder.yml"];
const SKIPPED = /(^|\/)(node_modules|test|tests|testing|fixtures|vectors|vendor|dist|build)(\/|$)|\.test\.|\.node-test\.|(^|\/)gen-vectors\.ts$|\.md$|^deploy\/fly\//;
const SOURCE = /\.(ts|tsx|mts|mjs|cjs|js|json|sh|ya?ml|toml|html|css)$|(^|\/)(Dockerfile|Caddyfile[^/]*)$/;
const FORBIDDEN = /openmausbot\.com|mausbot\.si(?![a-z0-9-])|omb-cloud-staging|milindsoni201\.workers\.dev|[a-z0-9-]+\.fly\.dev|cal\.com\/milind-soni|discord\.gg\/9Wb8MEpXRs/i;

function files(path: string): string[] {
  const full = join(root, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).flatMap((name) => {
    const child = relative(root, join(full, name)).split(sep).join("/");
    return SKIPPED.test(child) ? [] : files(child);
  });
}

describe("the original project's servers", () => {
  it("appear nowhere in what ArkoBot ships", () => {
    const shipped = ROOTS.flatMap(files).filter((path) => SOURCE.test(path) && !SKIPPED.test(path));
    expect(shipped.length).toBeGreaterThan(1000);
    const found = shipped.flatMap((path) => readFileSync(join(root, path), "utf8").split("\n")
      .flatMap((line, index) => (FORBIDDEN.test(line) ? [`${path}:${index + 1}: ${line.trim().slice(0, 160)}`] : [])));
    expect(found).toEqual([]);
  });

  it("are what the check looks for", () => {
    for (const host of ["https://cloud.openmausbot.com", "https://accounts.openmausbot.com", "c-0.mausbot.si", "https://omb-cloud-staging.fly.dev",
      "https://omb-u-1.fly.dev", "https://openmausbot-composio.milindsoni201.workers.dev"]) expect(FORBIDDEN.test(host), host).toBe(true);
    for (const kept of ["openmausbot.sidebarDensity", "com.openmausbot.app", "https://admin.arkobot.com.br", "OpenMausBot"]) expect(FORBIDDEN.test(kept), kept).toBe(false);
  });
});
