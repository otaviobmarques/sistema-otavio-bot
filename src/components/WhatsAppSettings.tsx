import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, MessageCircle, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { displayNumber, validOwnerNumber, type WhatsAppNotify, type WhatsAppState, type WhatsAppStatus } from "../../shared/whatsapp";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { api } from "@/state/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { Card, Switch } from "./SettingsPrimitives";

const STATE_KEY: Record<WhatsAppState, LocaleKey> = {
  off: "whatsapp.state.off",
  connecting: "whatsapp.state.connecting",
  "waiting-qr": "whatsapp.state.waitingQr",
  connected: "whatsapp.state.connected",
  reconnecting: "whatsapp.state.reconnecting",
  "logged-out": "whatsapp.state.loggedOut",
};
const PROBLEM_KEY: Record<string, LocaleKey> = {
  "qr-expired": "whatsapp.problem.qrExpired",
  replaced: "whatsapp.problem.replaced",
  "start-failed": "whatsapp.problem.startFailed",
};
const NOTIFY: Array<{ key: keyof WhatsAppNotify; label: LocaleKey }> = [
  { key: "approvals", label: "whatsapp.notify.approvals" },
  { key: "budget", label: "whatsapp.notify.budget" },
  { key: "problems", label: "whatsapp.notify.problems" },
];
const DOT: Record<WhatsAppState, string> = {
  off: "bg-ink-tertiary", connecting: "bg-warning", "waiting-qr": "bg-warning", connected: "bg-success", reconnecting: "bg-warning", "logged-out": "bg-danger",
};
const inputClass = "w-full rounded-lg border border-hairline/50 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-tertiary";
const moving = (state: WhatsAppState | undefined) => state === "connecting" || state === "waiting-qr" || state === "reconnecting";

/** The status view alone, so a preview can draw it from a made-up status. */
export function WhatsAppPanel({ status, busy, error, onConnect, onDisconnect, onSaveNumber, onNotify }: {
  status: WhatsAppStatus;
  busy: boolean;
  error: string;
  onConnect(): void;
  onDisconnect(): void;
  onSaveNumber(number: string): Promise<boolean>;
  onNotify(patch: Partial<WhatsAppNotify>): void;
}) {
  const [number, setNumber] = useState(status.ownerNumber ? displayNumber(status.ownerNumber) : "");
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const typed = number.trim();
  const invalid = typed !== "" && !validOwnerNumber(typed);
  const save = async () => {
    if (invalid) return;
    setSaved(await onSaveNumber(typed));
  };
  const linked = status.state !== "off" && status.state !== "logged-out";
  return (
    <div className="flex flex-col gap-4" data-whatsapp-settings>
      <Card title={t("whatsapp.title")} subtitle={t("whatsapp.subtitle")}>
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px] leading-relaxed text-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <div className="font-medium">{t("whatsapp.risk.title")}</div>
            <p className="mt-0.5 text-ink-secondary">{t("whatsapp.risk.body")}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[14px]" role="status" data-whatsapp-state={status.state}>
            <span className={`size-2.5 shrink-0 rounded-full ${DOT[status.state]}`} aria-hidden="true" />
            <span className="text-ink-secondary">{t("whatsapp.state.label")}:</span>
            <span className="font-medium text-ink">{t(STATE_KEY[status.state])}</span>
          </div>
          <div className="flex gap-2">
            {!linked && (
              <button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={onConnect} data-whatsapp-connect>
                <MessageCircle size={14} aria-hidden="true" />{t("whatsapp.connect")}
              </button>
            )}
            {status.state !== "off" && (
              <button type="button" className="ui-button" disabled={busy} onClick={() => setConfirming(true)} data-whatsapp-disconnect>
                <Unplug size={14} aria-hidden="true" />{t("whatsapp.disconnect")}
              </button>
            )}
          </div>
        </div>
        {status.problem && PROBLEM_KEY[status.problem] && <p role="alert" className="mt-2 text-[13px] text-warning">{t(PROBLEM_KEY[status.problem]!)}</p>}
        {status.state === "connected" && status.linkedNumber && (
          <p className="mt-2 text-[13px] text-ink-secondary">{t("whatsapp.linkedNumber", { number: displayNumber(status.linkedNumber) })}</p>
        )}
        {status.state === "waiting-qr" && status.qr && (
          <div className="mt-4 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
            <div className="shrink-0 rounded-2xl bg-white p-3" role="img" aria-label={t("whatsapp.qrAlt")}>
              <QRCodeSVG value={status.qr} size={232} level="L" marginSize={1} bgColor="#ffffff" fgColor="#111111" />
            </div>
            <p className="max-w-[300px] text-[13px] leading-relaxed text-ink-secondary">{t("whatsapp.scan")}</p>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[13px] text-danger">{t("whatsapp.error", { message: error })}</p>}
      </Card>
      <Card title={t("whatsapp.owner.label")} subtitle={t("whatsapp.owner.hint")}>
        <form className="flex flex-wrap items-start gap-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="min-w-[220px] flex-1">
            <input
              aria-label={t("whatsapp.owner.label")} inputMode="tel" autoComplete="tel" placeholder="+55 11 98765-4321"
              value={number} onChange={(event) => { setNumber(event.target.value); setSaved(false); }}
              aria-invalid={invalid} className={inputClass} data-whatsapp-owner
            />
            {invalid && <p className="mt-1 text-[12px] text-danger">{t("serverError.whatsapp.invalidNumber")}</p>}
            {!status.ownerNumber && !typed && <p className="mt-1 text-[12px] text-ink-secondary">{t("whatsapp.owner.missing")}</p>}
          </div>
          <button type="submit" className="ui-button" disabled={busy || invalid}>{saved ? t("whatsapp.owner.saved") : t("whatsapp.owner.save")}</button>
        </form>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">{t("whatsapp.howTo")}</p>
      </Card>
      <Card title={t("whatsapp.notify.title")}>
        <div className="flex flex-col gap-3">
          {NOTIFY.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3 text-[14px] text-ink">
              <span>{t(label)}</span>
              <Switch aria-label={t(label)} checked={status.notify[key]} disabled={busy} onClick={() => onNotify({ [key]: !status.notify[key] })} />
            </div>
          ))}
        </div>
      </Card>
      <ConfirmDialog
        open={confirming}
        title={t("whatsapp.disconnect")}
        body={t("whatsapp.disconnectConfirm")}
        confirmLabel={t("whatsapp.disconnect")}
        icon={<Unplug size={18} />}
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onDisconnect(); }}
      />
    </div>
  );
}

export function WhatsAppSettings() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setStatus(await api<WhatsAppStatus>("/api/whatsapp", { background: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const state = status?.state;
  useEffect(() => {
    const timer = window.setInterval(() => void load(), moving(state) ? 2_000 : 15_000);
    return () => window.clearInterval(timer);
  }, [load, state]);
  const run = async (work: () => Promise<WhatsAppStatus>): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      setStatus(await work());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!status) return error ? <p role="alert" className="text-[13px] text-danger">{t("whatsapp.error", { message: error })}</p> : null;
  return (
    <WhatsAppPanel
      status={status} busy={busy} error={error}
      onConnect={() => void run(() => api("/api/whatsapp/connect", { method: "POST" }))}
      onDisconnect={() => void run(() => api("/api/whatsapp/disconnect", { method: "POST" }))}
      onSaveNumber={(ownerNumber) => run(() => api("/api/whatsapp/settings", { method: "PUT", body: JSON.stringify({ ownerNumber }) }))}
      onNotify={(notify) => void run(() => api("/api/whatsapp/settings", { method: "PUT", body: JSON.stringify({ notify }) }))}
    />
  );
}
