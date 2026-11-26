import { HardDrive } from "lucide-react";
import { intlLocale, t } from "@/lib/i18n";
import { useStore } from "@/state/store";

const GB = 1024 ** 3;

export function storageGb(bytes: number): string {
  return `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(bytes / GB)} GB`;
}

/** This Cloud's space reached its plan's limit, as the Admin said (server/host/cloud-storage-quota.ts): from 100% a strip
 * says so, and from 110% that new files are refused. Nothing is shown below 100%, or on any server the Admin never told. */
export function CloudStorageStrip() {
  const { state } = useStore();
  const storage = state.config?.cloudStorage;
  if (!storage || (storage.state !== "full" && storage.state !== "over")) return null;
  const params = { used: storageGb(storage.usedBytes), quota: storage.quotaBytes ? storageGb(storage.quotaBytes) : "—" };
  return <div role="status" data-cloud-storage={storage.state} className="flex items-center justify-center gap-2 border-b border-hairline/40 bg-panel px-3 py-1.5 text-[13px] text-danger">
    <HardDrive size={14} aria-hidden="true" />
    <span>{t(storage.state === "over" ? "cloudStorage.banner.over" : "cloudStorage.banner.full", params)}</span>
  </div>;
}
