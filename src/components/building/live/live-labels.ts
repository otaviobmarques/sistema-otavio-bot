import { t } from "@/lib/i18n";
import type { DeskStatus } from "../building-view";

export const STATUS_COLOR: Record<DeskStatus, string> = { working: "#22c55e", waiting: "#f59e0b", blocked: "#ef4444", idle: "#6b7280" };

/** The short name a lift button shows for a level. */
export function levelTag(level: number, penthouse: number): string {
  if (level === 0) return t("building.live.tagGround");
  if (level === penthouse) return t("building.live.tagTop");
  return t("building.live.tagFloor", { number: level });
}
