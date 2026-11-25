// Imported first by the desktop's main process, as server/env-aliases.ts is by the server's entry points (a parity test
// keeps the two alike), so ARKOBOT_* settings reach code that reads OMB_* at import.

export const ENV_PREFIX = "ARKOBOT_";
export const LEGACY_ENV_PREFIX = "OMB_";

/** Moves each `ARKOBOT_<NAME>` to `OMB_<NAME>`, over an `OMB_<NAME>` already set; moved, so no `ARKOBOT_` twin of a
 * credential reaches a child process past the `OMB_` strip lists. Case-insensitive on Windows. */
export function canonicalizeEnv(env, platform = process.platform) {
  for (const key of Object.keys(env)) {
    const prefixed = platform === "win32" ? key.toUpperCase().startsWith(ENV_PREFIX) : key.startsWith(ENV_PREFIX);
    if (!prefixed) continue;
    const value = env[key];
    delete env[key];
    const name = key.slice(ENV_PREFIX.length);
    if (value === undefined || !name) continue;
    if (platform === "win32") {
      for (const other of Object.keys(env)) if (other.toUpperCase() === `${LEGACY_ENV_PREFIX}${name.toUpperCase()}`) delete env[other];
    }
    env[`${LEGACY_ENV_PREFIX}${name}`] = value;
  }
}

canonicalizeEnv(process.env);
