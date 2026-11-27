// "Abrir meu ArkoBot" with a sleeping instance: the first click wakes it, the card says "Acordando…" and waits until
// the instance answers, then asks for the sign-in link again and sends the tab there. The tab is opened by the click
// itself (no pop-up blocker) and shows a short note while it waits.
import type { ArkoBotView, OpenResult } from "../../customer/arkobot.ts";
import { api } from "../../web/api.ts";

/** How often the card reads the state while waiting, and how long it waits at most. */
export const WAKE_POLL_MS = 2_000;
export const WAKE_TIMEOUT_MS = 120_000;
/** Asking for the link counts against a per-minute limit: while the state already says ready, ask at most this often. */
const OPEN_RETRY_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function note(tab: Window | null, text: string) {
  try {
    if (!tab || tab.closed) return;
    tab.document.title = "ArkoBot";
    tab.document.body.style.cssText = "margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;background:#050817;color:#e2e8f0;text-align:center;padding:16px";
    tab.document.body.textContent = text;
  } catch {
    // A tab we can no longer write to: it gets its address at the end all the same.
  }
}

export interface OpenDeps {
  /** Called with true while it waits for a sleeping instance, false when done. */
  waking(on: boolean): void;
  /** Stops waiting (the card went away). */
  cancelled(): boolean;
}

/** Opens the instance in `tab`; wakes it first if it sleeps. Throws with a message for the toast. */
export async function openArkoBotIn(tab: Window | null, deps: OpenDeps): Promise<void> {
  let result = await api<OpenResult>("/api/conta/arkobot/abrir", { method: "POST", body: {} });
  if ("waking" in result) {
    deps.waking(true);
    note(tab, "Seu ArkoBot está acordando… Em alguns segundos ele abre aqui.");
    const started = Date.now();
    let askedAt = 0;
    try {
      while ("waking" in result) {
        if (deps.cancelled()) throw new Error("Cancelado");
        if (Date.now() - started > WAKE_TIMEOUT_MS) throw new Error("Seu ArkoBot está demorando para acordar. Tente de novo em um minuto.");
        await sleep(WAKE_POLL_MS);
        const view = await api<ArkoBotView>("/api/conta/arkobot");
        if (view.status !== "ready" && view.status !== "payment_pending") {
          if (!view.canOpen) throw new Error("Seu ArkoBot não pode ser aberto agora. Atualize a página.");
          continue;
        }
        if (Date.now() - askedAt < OPEN_RETRY_MS) continue;
        askedAt = Date.now();
        result = await api<OpenResult>("/api/conta/arkobot/abrir", { method: "POST", body: {} });
      }
    } finally {
      deps.waking(false);
    }
  }
  if (tab && !tab.closed) tab.location.replace(result.url);
  else window.location.assign(result.url);
}
