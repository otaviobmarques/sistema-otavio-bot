// Where the desktop keeps its data, as server/data-dir.ts resolves it for the server (a parity test keeps them alike).
import fs from "node:fs";
import path from "node:path";

export const DATA_FOLDER = ".arkobot";
/** Data already in the earlier folder stays there: bots' workspaces, engine sessions keyed by their folder and saved
 * paths all name it. */
export const LEGACY_DATA_FOLDER = ".openmausbot";
export const COMPANION_FOLDER = ".arkobot-companion";
export const LEGACY_COMPANION_FOLDER = ".openmausbot-companion";
/** The folder Electron named the profile after before the Windows build was called ArkoBot (the packaged productName). */
export const LEGACY_USER_DATA_FOLDER = "OpenMausBot";

/** `<base>/<legacy>` while that folder exists, else `<base>/<current>`. */
export function homeFolder(base, current, legacy, { exists = fs.existsSync, join = path.join } = {}) {
  const old = join(base, legacy);
  return exists(old) ? old : join(base, current);
}

/** The data folder when OMB_DATA_DIR names none (an empty one included). */
export function defaultDataDir(home, options) {
  return homeFolder(home, DATA_FOLDER, LEGACY_DATA_FOLDER, options);
}

/** Whether a folder name is one this app gives a data folder: its own, or a clean workspace's `<name>-<slug>`. */
export function isDataFolderName(name) {
  return [DATA_FOLDER, LEGACY_DATA_FOLDER].some((folder) => name === folder || name.startsWith(`${folder}-`));
}

/**
 * The profile folder (cookies, local storage, the safeStorage key, credentials, the single-instance lock). Electron
 * names it after the packaged productName, so the profile an install already has, under its earlier name, stays in use.
 */
export function pinnedUserData({ appData, current, exists = fs.existsSync, join = path.join }) {
  // Electron names it after the package's name (openmausbot) unless a productName reaches it: either spelling is the
  // folder an install already has, left exactly as Electron gave it.
  if (path.basename(current).toLowerCase() === LEGACY_USER_DATA_FOLDER.toLowerCase()) return current;
  const legacy = join(appData, LEGACY_USER_DATA_FOLDER);
  return exists(legacy) ? legacy : current;
}
