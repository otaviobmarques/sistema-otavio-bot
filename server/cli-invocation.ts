import { basename } from "node:path";

import { CLI_NAME } from "../shared/product-name.ts";

export { CLI_NAME };
/** The command's first name, still the npm package's and still working everywhere `arkobot` does. */
export const LEGACY_CLI_NAME = "openmausbot";

/** How this CLI was started, so every command it prints can be pasted as is: `npx openmausbot` (npx runs a package by
 * its npm name), `pnpm omb` in a checkout, the Docker image's `docker compose exec omb arkobot` (OMB_CLI_PREFIX),
 * `openmausbot` when typed by that name, or plain `arkobot`. */
export function cliPrefix(env: NodeJS.ProcessEnv = process.env, script = process.argv[1] ?? ""): string {
  const fixed = env.OMB_CLI_PREFIX?.trim();
  if (fixed) return fixed;
  if (env.npm_lifecycle_event === "omb") return "pnpm omb";
  // npm 7+ runs an `npx` package from its cache's `_npx` folder (npm_command=exec alone also marks `npx vitest`).
  if (/[\\/]_npx[\\/]/.test(script)) return `npx ${LEGACY_CLI_NAME}`;
  // npm's bin links (and its Windows .cmd and .ps1 shims) carry the name typed; the bundle itself is openmausbot.js.
  const typed = basename(script.replace(/\\/g, "/")).replace(/\.(cmd|ps1)$/i, "");
  return typed === LEGACY_CLI_NAME ? LEGACY_CLI_NAME : CLI_NAME;
}

/** `arkobot <rest>` the way this CLI was started. */
export function cliCommand(rest: string, env?: NodeJS.ProcessEnv, script?: string): string {
  return `${cliPrefix(env, script)} ${rest}`;
}
