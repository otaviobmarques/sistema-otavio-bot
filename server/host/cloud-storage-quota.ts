// How full this Cloud's disk is against its plan, as the Admin last said in its signed POST /api/cloud/storage. The Admin's
// node agent measures the data volume (a Docker volume has no hard quota) and the Admin compares it with the plan: ok,
// warning (≥80%), full (≥100%), over (≥110%). Kept in a file so a restart keeps it. Only `over` changes anything here:
// new uploads are refused until files are deleted or the plan grows. Nothing is ever deleted, and reading, deleting and
// chatting are never blocked. Anything that is not a Cloud home, and an Admin that never said, reads as no limit.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { writeFileAtomic } from "../atomic.ts";
import { serverLine } from "../server-lines.ts";

export const CLOUD_STORAGE_FILE = "cloud-storage.json";
export const STORAGE_FULL_CODE = "storage_full";

export const cloudStorageSchema = z.object({
  state: z.enum(["ok", "warning", "full", "over"]),
  usedBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  quotaBytes: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable(),
});
export type CloudStorageStatus = z.infer<typeof cloudStorageSchema>;
const fileSchema = cloudStorageSchema.extend({ v: z.literal(1) });

export interface CloudStorageQuota {
  /** What the Admin last said; undefined when it never did (or this is not a Cloud home). */
  status(): CloudStorageStatus | undefined;
  /** Takes the Admin's signed word; false when the body is not a storage state. */
  set(input: unknown): boolean;
  /** Whether a new upload must be refused now. */
  uploadsRefused(): boolean;
}

export function createCloudStorageQuota(deps: { dataDir: string; cloudHome: boolean; changed?: () => void }): CloudStorageQuota {
  const file = join(deps.dataDir, CLOUD_STORAGE_FILE);
  let status: CloudStorageStatus | undefined;
  if (deps.cloudHome) {
    try {
      const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (parsed.success) status = { state: parsed.data.state, usedBytes: parsed.data.usedBytes, quotaBytes: parsed.data.quotaBytes };
    } catch {
      // none yet, or unreadable: no limit
    }
  }
  return {
    status: () => status,
    uploadsRefused: () => status?.state === "over",
    set(input) {
      const parsed = cloudStorageSchema.safeParse(input);
      if (!parsed.success) return false;
      if (!deps.cloudHome) return true;
      const next = parsed.data;
      if (status && status.state === next.state && status.usedBytes === next.usedBytes && status.quotaBytes === next.quotaBytes) return true;
      status = next;
      try {
        writeFileAtomic(file, `${JSON.stringify({ v: 1, ...next })}\n`, { mode: 0o600 });
      } catch (error) {
        console.warn(`cloud storage: could not save ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
      deps.changed?.();
      return true;
    },
  };
}

/** The refusal of a new upload once the space ran out, in the app's language; Portuguese when none is set, since only the
 * ArkoBot Admin, whose customers read Portuguese, ever says how full a Cloud is. */
export function storageFullLine(language: string | undefined): string {
  return serverLine(language ?? "pt-br", "server.storageFull");
}
