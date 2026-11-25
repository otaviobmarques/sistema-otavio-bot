import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";

let home: string | undefined;

/** The home the data folder lives under. Under vitest, with HOME still the real one, a temp folder instead, so a test
 * never reads, migrates or deletes the person's own data. */
export function dataHome(): string {
  if (home !== undefined) return home;
  const real = homedir();
  home = process.env.VITEST !== undefined && real === userInfo().homedir ? mkdtempSync(join(tmpdir(), "omb-test-home-")) : real;
  return home;
}

/** The data folder's name under the home. */
export const DATA_FOLDER = ".arkobot";
/** Its name before the rebrand. Data already there stays there: bots' workspaces, engine sessions keyed by their
 * folder, bind mounts and saved paths all name it, so it is never renamed underneath them. */
export const LEGACY_DATA_FOLDER = ".openmausbot";

/** `<home>/<legacy>` while that folder exists, else `<home>/<current>`. Every process resolves the same way, so a
 * computer never runs two servers on two folders. */
export function homeFolder(base: string, current: string, legacy: string, options: { exists?: (path: string) => boolean; join?: (...parts: string[]) => string } = {}): string {
  const exists = options.exists ?? existsSync, joinPath = options.join ?? join;
  const old = joinPath(base, legacy);
  return exists(old) ? old : joinPath(base, current);
}

/** The data folder when OMB_DATA_DIR (or ARKOBOT_DATA_DIR) names none. */
export function defaultDataDir(base: string = homedir(), options: { exists?: (path: string) => boolean; join?: (...parts: string[]) => string } = {}): string {
  return homeFolder(base, DATA_FOLDER, LEGACY_DATA_FOLDER, options);
}
