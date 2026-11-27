// The space line of the "Meu ArkoBot" card: "X GB de Y GB usados", a bar, and a warning from 80%. Shared by the server
// (what /api/conta/arkobot answers) and the card, so it imports nothing.

export type DiskUsageState = "ok" | "warning" | "full" | "over";

export interface DiskUsageView {
  usedBytes: number;
  quotaBytes: number;
  state: DiskUsageState;
  measuredAt: string;
}

const GB = 1024 ** 3;
const STATES: readonly DiskUsageState[] = ["ok", "warning", "full", "over"];

/** The card's numbers from the instance row; null until the agent measured it, or when the plan sets no limit. */
export function diskUsageOf(row: { disk_used_bytes?: unknown; disk_quota_bytes?: unknown; disk_state?: unknown; disk_measured_at?: unknown } | null): DiskUsageView | null {
  if (!row || row.disk_used_bytes == null || row.disk_quota_bytes == null || !row.disk_measured_at) return null;
  const state = STATES.find((value) => value === row.disk_state);
  const usedBytes = Number(row.disk_used_bytes), quotaBytes = Number(row.disk_quota_bytes);
  if (!state || !Number.isFinite(usedBytes) || !(quotaBytes > 0)) return null;
  return { usedBytes, quotaBytes, state, measuredAt: new Date(row.disk_measured_at as string | Date).toISOString() };
}

const gb = (bytes: number) => (bytes / GB).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export interface DiskUsageCopy {
  line: string;
  /** 0–100, for the bar's width. */
  percent: number;
  tone: "ok" | "warning" | "danger";
  warning: string | null;
}

export function diskUsageCopy(disk: DiskUsageView): DiskUsageCopy {
  const percent = Math.min(100, Math.max(0, Math.round((disk.usedBytes / disk.quotaBytes) * 100)));
  const line = `${gb(disk.usedBytes)} GB de ${gb(disk.quotaBytes)} GB usados`;
  if (disk.state === "over") {
    return { line, percent, tone: "danger", warning: "Seu espaço acabou: apague arquivos ou mude de plano. Até lá, o ArkoBot não aceita arquivos novos (seus bots continuam conversando)." };
  }
  if (disk.state === "full") {
    return { line, percent, tone: "danger", warning: "Seu espaço acabou. Apague arquivos ou mude de plano: passando um pouco do limite, o ArkoBot para de aceitar arquivos novos." };
  }
  if (disk.state === "warning") {
    return { line, percent, tone: "warning", warning: "Seu espaço está quase no fim (mais de 80%). Apague arquivos que não usa ou mude de plano." };
  }
  return { line, percent, tone: "ok", warning: null };
}
