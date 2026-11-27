// How much each instance's data volume holds. Docker's local volumes have no quota, so the Admin keeps a soft one from
// these numbers (src/provisioning/storage.ts). GET /system/df walks every volume and is slow on a busy node: it is asked
// at most once per interval, and only the volumes labelled as this node's instances are read from it. A failed or slow
// measurement never holds up or breaks the agent's report: the last numbers are kept and sent again.
import { setTimeout as sleep } from "node:timers/promises";
import type { StatusReport } from "../provisioning/protocol.ts";
import { LABEL_INSTANCE, LABEL_MANAGED, LABEL_NODE } from "../provisioning/protocol.ts";
import type { DockerApi } from "./docker.ts";

export const DISK_MEASURE_INTERVAL_MS = 10 * 60_000;
/** How long a poll waits for a measurement before reporting without it; it then finishes in the background. */
export const DISK_MEASURE_WAIT_MS = 20_000;

export interface DiskMeter {
  /** Adds each instance's last measured size to the report, measuring first when the last one is old enough. */
  attach(report: StatusReport, nodeId: string): Promise<void>;
}

interface Measurement {
  sizes: Map<string, number>;
  measuredAt: string;
}

/** instance id → bytes, from the volumes this agent made for this node (managed labels), with a size Docker knew. */
export function instanceVolumeSizes(volumes: Awaited<ReturnType<DockerApi["volumeUsage"]>>, nodeId: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const volume of volumes) {
    const labels = volume.Labels ?? {};
    const instanceId = labels[LABEL_INSTANCE];
    const size = volume.UsageData?.Size;
    if (labels[LABEL_MANAGED] !== "true" || labels[LABEL_NODE] !== nodeId || typeof instanceId !== "string") continue;
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) continue;
    sizes.set(instanceId, size);
  }
  return sizes;
}

export function createDiskMeter(docker: Pick<DockerApi, "volumeUsage">, options: {
  intervalMs?: number; waitMs?: number; now?: () => number; log?: (line: string) => void;
} = {}): DiskMeter {
  const intervalMs = options.intervalMs ?? DISK_MEASURE_INTERVAL_MS;
  const waitMs = options.waitMs ?? DISK_MEASURE_WAIT_MS;
  const now = options.now ?? Date.now;
  let last: Measurement | null = null;
  let lastAttempt = -Infinity;
  let running: Promise<void> | null = null;

  const measure = (nodeId: string): Promise<void> => {
    lastAttempt = now();
    running = docker.volumeUsage()
      .then((volumes) => { last = { sizes: instanceVolumeSizes(volumes, nodeId), measuredAt: new Date(now()).toISOString() }; })
      .catch((error: unknown) => { options.log?.(`não consegui medir os volumes (${(error as Error).message?.slice(0, 200)}); mando a última medição`); })
      .finally(() => { running = null; });
    return running;
  };

  return {
    async attach(report, nodeId) {
      if (report.instances.length === 0) return;
      if (!running && now() - lastAttempt >= intervalMs) {
        const done = measure(nodeId);
        await Promise.race([done, sleep(waitMs, undefined, { ref: false })]);
      }
      const measured = last as Measurement | null;
      if (!measured) return;
      for (const instance of report.instances) {
        const bytes = measured.sizes.get(instance.id);
        if (bytes !== undefined) instance.disk = { bytes, measuredAt: measured.measuredAt };
      }
    },
  };
}
