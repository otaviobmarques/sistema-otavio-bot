// Where what Cloud bots make lands on this computer: Documents/ArkoBot, one folder for each bot. Computers that synced
// before the rename have Documents/MausBot; it becomes Documents/ArkoBot when that is safe and is never deleted.
import fs from "node:fs";
import path from "node:path";

export const OUTPUTS_FOLDER = "ArkoBot";
export const LEGACY_OUTPUTS_FOLDER = "MausBot";

const isDir = (fsImpl, dir) => {
  try { return fsImpl.statSync(dir).isDirectory(); } catch { return false; }
};
const exists = (fsImpl, file) => {
  try { fsImpl.lstatSync(file); return true; } catch { return false; }
};

/**
 * The outputs folder to use under `documentsDir`: Documents/MausBot is renamed to Documents/ArkoBot when only it
 * exists (one rename, same disk, so nothing is copied). When the rename fails the old folder stays as it was and is
 * used. When both exist, Documents/ArkoBot is used and neither is touched. Returns `{ dir, legacy, moved, problem }`:
 * `legacy` is the old folder whose paths may still be named elsewhere.
 */
export function settleOutputsFolder(documentsDir, { fs: fsImpl = fs, pathApi = path } = {}) {
  const dir = pathApi.join(documentsDir, OUTPUTS_FOLDER);
  const legacy = pathApi.join(documentsDir, LEGACY_OUTPUTS_FOLDER);
  if (!isDir(fsImpl, legacy) || exists(fsImpl, dir)) return { dir, legacy, moved: false, problem: null };
  try {
    fsImpl.renameSync(legacy, dir);
    return { dir, legacy, moved: true, problem: null };
  } catch (error) {
    return { dir: legacy, legacy, moved: false, problem: error?.code ?? String(error?.message ?? error) };
  }
}

const fold = (value, pathApi) => (pathApi.sep === "\\" ? value.toLowerCase() : value);

/** `file` with its `from` folder swapped for `to`, when it is inside `from`; else null. Windows compares any case. */
export function rebasePath(file, from, to, pathApi = path) {
  if (typeof file !== "string" || !file) return null;
  const normal = pathApi.normalize(file);
  const base = pathApi.normalize(from).replace(/[\\/]+$/, "");
  if (fold(normal, pathApi) === fold(base, pathApi)) return pathApi.normalize(to);
  if (!fold(normal, pathApi).startsWith(fold(base + pathApi.sep, pathApi))) return null;
  return pathApi.join(to, normal.slice(base.length + 1));
}

/**
 * A path saved before the rename (a conversation, an attachment, Files' own records) that named Documents/MausBot:
 * where it is now, when it is gone from there and its copy in Documents/ArkoBot exists. Anything else comes back as it
 * was. Security: a page names `file`, so nothing on disk is looked at unless it is inside Documents/MausBot (a UNC
 * path is never touched).
 */
export function movedOutputPath(file, documentsDir, { fs: fsImpl = fs, pathApi = path } = {}) {
  const moved = rebasePath(file, pathApi.join(documentsDir, LEGACY_OUTPUTS_FOLDER), pathApi.join(documentsDir, OUTPUTS_FOLDER), pathApi);
  if (!moved || exists(fsImpl, file)) return file;
  return exists(fsImpl, moved) ? moved : file;
}
