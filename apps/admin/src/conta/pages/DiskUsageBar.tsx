import { HardDrive } from "lucide-react";
import { diskUsageCopy, type DiskUsageView } from "../../customer/disk-usage.ts";
import { cx } from "../../web/ui.tsx";

const BAR = { ok: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500" } as const;

/** "X GB de Y GB usados", a bar, and from 80% a line on what to do. */
export function DiskUsageBar({ disk }: { disk: DiskUsageView }) {
  const copy = diskUsageCopy(disk);
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-sm"><HardDrive className="h-4 w-4 opacity-70" /> Espaço: {copy.line}</div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={copy.percent} aria-label="Espaço usado">
        <div className={cx("h-full rounded-full", BAR[copy.tone])} style={{ width: `${copy.percent}%` }} />
      </div>
      {copy.warning ? <p className={cx("mt-1 text-xs font-medium", copy.tone === "danger" ? "text-red-700" : "text-amber-800")}>{copy.warning}</p> : null}
    </div>
  );
}
