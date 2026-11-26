import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { productName } from "@/lib/brand";
import { appVersion } from "@/lib/app-links";
import { updaterMessage, useUpdaterState, type UpdaterState } from "@/lib/updater";
import { useCaptionChrome } from "./DesktopCapabilities";

const COVERED: ReadonlyArray<UpdaterState["status"]> = ["checking", "downloading", "preparing", "downloaded", "installing", "error"];

export type RequiredUpdateView =
  | { step: "checking" | "preparing" | "installing" }
  | { step: "downloading"; percent: number | null }
  | { step: "failed"; message: string; retry: boolean };

/** What the cover says, or null while the app may be used: no update was found at launch, or the person's Try again
 * found none. Only main's launch check marks an update `mandatory` (electron/updater.mjs). */
export function requiredUpdateView(state: UpdaterState | null): RequiredUpdateView | null {
  if (!state?.mandatory || !COVERED.includes(state.status)) return null;
  switch (state.status) {
    case "checking":
      return { step: "checking" };
    case "downloading":
      return { step: "downloading", percent: typeof state.percent === "number" ? Math.max(0, Math.min(100, Math.round(state.percent))) : null };
    case "preparing":
      return { step: "preparing" };
    case "error": {
      const said = updaterMessage(state)?.split("\n")[0]?.trim();
      return { step: "failed", message: said ? said.slice(0, 240) : t("update.banner.somethingWrong"), retry: state.retryable !== false };
    }
    default:
      return { step: "installing" };
  }
}

function stepLine(view: RequiredUpdateView): string {
  switch (view.step) {
    case "checking":
      return t("common.checking");
    case "downloading":
      return view.percent === null ? t("update.card.downloadingStart") : t("update.card.downloading", { percent: view.percent });
    case "preparing":
      return t("update.required.preparing");
    case "installing":
      return t("update.required.installing", { app: productName() });
    case "failed":
      return t("update.card.failed");
  }
}

/** Covers the whole window while a required update downloads and installs: no Later, no close. A failure says why and
 * offers Try again; nothing retries by itself. The window's own caption buttons (Windows) stay usable above it. */
export function RequiredUpdateScreen() {
  const state = useUpdaterState();
  const view = requiredUpdateView(state);
  const { windowsCaption, dragProps } = useCaptionChrome();
  const [retrying, setRetrying] = useState(false);
  const retryRef = useRef<HTMLButtonElement>(null);
  const step = view?.step;
  useEffect(() => setRetrying(false), [state?.status]);
  useEffect(() => {
    if (step === "failed") retryRef.current?.focus();
  }, [step]);
  if (!view || !state) return null;

  const percent = view.step === "downloading" ? view.percent : null;
  const busy = view.step !== "failed";
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="required-update-title"
      aria-describedby="required-update-step"
      data-required-update={view.step}
      className={cn("fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center bg-app p-6", windowsCaption ? "top-7" : "top-0")}
    >
      {dragProps.style && !windowsCaption && <div aria-hidden {...dragProps} className="absolute inset-x-0 top-0 h-7" />}
      <div className="w-full max-w-[380px] rounded-2xl border border-hairline/40 bg-panel p-6 shadow-2xl shadow-black/30">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles size={18} />
        </span>
        <h1 id="required-update-title" className="mt-4 text-[18px] font-semibold text-ink">
          {t("update.required.title")}
        </h1>
        <p className="mt-1.5 text-[14px] leading-snug text-ink-secondary">
          {state.version
            ? t("update.required.body", { app: productName(), version: state.version })
            : t("update.required.bodyNoVersion", { app: productName() })}
        </p>
        <p className="mt-1 text-[12px] text-ink-tertiary">{t("about.version", { version: appVersion() })}</p>

        <div className="mt-5">
          <div id="required-update-step" className="flex items-center gap-2 text-[13px] font-medium text-ink" aria-live="polite">
            {busy && <Loader2 size={14} className="shrink-0 animate-spin text-ink-secondary" />}
            <span>{stepLine(view)}</span>
          </div>
          {busy && (
            <div
              role="progressbar"
              aria-label={t("update.card.progress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-control"
            >
              <div
                className={cn("h-full rounded-full bg-accent transition-[width] duration-300", percent === null && "animate-pulse")}
                style={{ width: `${view.step === "downloading" ? percent ?? 4 : view.step === "checking" ? 4 : 100}%` }}
              />
            </div>
          )}
          {view.step === "failed" && (
            <>
              <p className="mt-1.5 text-[13px] leading-snug text-ink-secondary" title={view.message}>{view.message}</p>
              {view.retry && (
                <button
                  ref={retryRef}
                  type="button"
                  disabled={retrying}
                  onClick={() => {
                    setRetrying(true);
                    void window.ogb?.updater?.check().catch(() => setRetrying(false));
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[13px] font-medium text-white transition-colors disabled:cursor-default disabled:bg-control disabled:text-ink-secondary"
                >
                  {retrying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {t("update.required.retry")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
