// Imported first by every entry point an operator starts, so ARKOBOT_* settings reach code that reads OMB_* at import.

/** The prefix operators may write settings with. */
export const ENV_PREFIX = "ARKOBOT_";
/** The prefix the code reads, and every existing deployment sets. */
export const LEGACY_ENV_PREFIX = "OMB_";

/** Moves each `ARKOBOT_<NAME>` to `OMB_<NAME>`, over an `OMB_<NAME>` already set. Moved, not copied: the lists that keep
 * credentials out of child processes name only `OMB_` variables, so no `ARKOBOT_` twin may stay behind to leak. Names
 * compare case-insensitively on Windows, as its environment does. */
export function canonicalizeEnv(env: Record<string, string | undefined>, platform: NodeJS.Platform = process.platform): void {
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
