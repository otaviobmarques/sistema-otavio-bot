// The owner's WhatsApp link: off until the owner presses Connect, then it keeps itself up. A dropped link retries with a
// growing wait; the phone ending the session erases it. Settings and the session live under <data>/whatsapp, 0700.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_WHATSAPP_NOTIFY, phoneDigits, validOwnerNumber, type WhatsAppNotify, type WhatsAppSettingsInput, type WhatsAppState, type WhatsAppStatus } from "../../shared/whatsapp.ts";
import { writeFileAtomic } from "../atomic.ts";
import { eraseSession, holdsSession } from "./baileys.ts";
import type { IncomingText, TransportClose, TransportSession, WhatsAppTransport } from "./transport.ts";

/** The waits between tries after the link drops; the last one repeats. */
export const RECONNECT_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
/** After WhatsApp says another device took over this session, a long wait: two servers on one session fight. */
const REPLACED_DELAY_MS = 10 * 60_000;

export type WhatsAppProblem = "qr-expired" | "replaced" | "start-failed";

interface Stored {
  /** The owner pressed Connect and has not disconnected since: the server links again when it starts. */
  enabled: boolean;
  ownerNumber?: string;
  notify: WhatsAppNotify;
}

export interface WhatsAppConnectionDeps {
  dataDir: string;
  transport: () => WhatsAppTransport;
  message(message: IncomingText): void;
  /** The status changed: the Settings page reads it again. */
  changed?(status: WhatsAppStatus): void;
  later?(run: () => void, ms: number): { cancel(): void };
}

export type SettingsOutcome = { ok: true; status: WhatsAppStatus } | { ok: false; code: "serverError.whatsapp.invalidNumber" };

export function createWhatsAppConnection(deps: WhatsAppConnectionDeps) {
  const dir = join(deps.dataDir, "whatsapp");
  const sessionDir = join(dir, "session");
  const settingsPath = join(dir, "settings.json");
  const later = deps.later ?? ((run, ms) => {
    const timer = setTimeout(run, ms);
    timer.unref?.();
    return { cancel: () => clearTimeout(timer) };
  });

  const read = (): Stored => {
    try {
      const value = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<Stored>;
      return {
        enabled: value.enabled === true,
        ...(typeof value.ownerNumber === "string" && value.ownerNumber ? { ownerNumber: value.ownerNumber } : {}),
        notify: { ...DEFAULT_WHATSAPP_NOTIFY, ...value.notify },
      };
    } catch {
      return { enabled: false, notify: { ...DEFAULT_WHATSAPP_NOTIFY } };
    }
  };
  let stored = read();
  const save = () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileAtomic(settingsPath, JSON.stringify(stored), { mode: 0o600 });
  };

  let state: WhatsAppState = "off";
  let qr: string | undefined;
  let linkedNumber: string | undefined;
  let problem: WhatsAppProblem | undefined;
  let session: TransportSession | null = null;
  let generation = 0;
  let attempts = 0;
  let retry: { cancel(): void } | null = null;

  const status = (): WhatsAppStatus => ({
    state,
    ...(state === "waiting-qr" && qr ? { qr } : {}),
    ...(state === "connected" && linkedNumber ? { linkedNumber } : {}),
    ...(stored.ownerNumber ? { ownerNumber: stored.ownerNumber } : {}),
    notify: stored.notify,
    ...(problem ? { problem } : {}),
  });
  const set = (next: WhatsAppState, patch: { problem?: WhatsAppProblem } = {}) => {
    state = next;
    problem = patch.problem;
    if (next !== "waiting-qr") qr = undefined;
    if (next !== "connected") linkedNumber = undefined;
    deps.changed?.(status());
  };

  const stopTimers = () => {
    retry?.cancel();
    retry = null;
  };

  function schedule(ms: number): void {
    stopTimers();
    retry = later(() => { retry = null; void open(); }, ms);
  }

  function closed(mine: number, reason: TransportClose): void {
    if (mine !== generation) return;
    session = null;
    if (!stored.enabled) return set("off");
    if (reason === "logged-out") {
      eraseSession(sessionDir);
      stored = { ...stored, enabled: false };
      save();
      return set("logged-out");
    }
    if (reason === "restart") return void open();
    if (!holdsSession(sessionDir)) {
      stored = { ...stored, enabled: false };
      save();
      return set("off", { problem: "qr-expired" });
    }
    set("reconnecting", reason === "replaced" ? { problem: "replaced" } : {});
    schedule(reason === "replaced" ? REPLACED_DELAY_MS : RECONNECT_DELAYS_MS[Math.min(attempts, RECONNECT_DELAYS_MS.length - 1)]!);
    attempts += 1;
  }

  async function open(): Promise<void> {
    stopTimers();
    const mine = ++generation;
    if (state !== "reconnecting") set("connecting");
    try {
      const opened = await deps.transport().start(sessionDir, {
        qr: (code) => {
          if (mine !== generation) return;
          qr = code;
          set("waiting-qr");
        },
        open: (number) => {
          if (mine !== generation) return;
          attempts = 0;
          linkedNumber = number || undefined;
          set("connected");
        },
        close: (reason) => closed(mine, reason),
        message: (message) => {
          if (mine === generation && state === "connected") deps.message(message);
        },
      });
      if (mine !== generation) opened.end();
      else session = opened;
    } catch {
      if (mine !== generation) return;
      session = null;
      set(holdsSession(sessionDir) ? "reconnecting" : "off", { problem: "start-failed" });
      if (holdsSession(sessionDir)) schedule(RECONNECT_DELAYS_MS[Math.min(attempts++, RECONNECT_DELAYS_MS.length - 1)]!);
    }
  }

  return {
    status,
    settings: (): Readonly<Stored> => stored,
    sessionDir,

    /** At server start: links again when the owner left it on. */
    boot(): void {
      if (stored.enabled && holdsSession(sessionDir)) void open();
    },

    update(input: WhatsAppSettingsInput): SettingsOutcome {
      if (input.ownerNumber !== undefined) {
        const typed = input.ownerNumber.trim();
        if (typed && !validOwnerNumber(typed)) return { ok: false, code: "serverError.whatsapp.invalidNumber" };
        const { ownerNumber: _old, ...rest } = stored;
        stored = typed ? { ...rest, ownerNumber: phoneDigits(typed) } : rest;
      }
      if (input.notify) stored = { ...stored, notify: { ...stored.notify, ...input.notify } };
      save();
      deps.changed?.(status());
      return { ok: true, status: status() };
    },

    connect(): WhatsAppStatus {
      stored = { ...stored, enabled: true };
      save();
      if (state === "off" || state === "logged-out" || state === "reconnecting") {
        attempts = 0;
        void open();
      }
      return status();
    },

    /** Unlinks the device on the phone too, erases the session and stays off until Connect. */
    async disconnect(): Promise<WhatsAppStatus> {
      stopTimers();
      generation += 1;
      stored = { ...stored, enabled: false };
      save();
      const current = session;
      session = null;
      if (current) await current.logout().catch(() => {});
      eraseSession(sessionDir);
      set("off");
      return status();
    },

    connected: () => state === "connected" && session !== null,

    async send(to: string, text: string): Promise<string | null> {
      if (!session || state !== "connected") return null;
      return session.send(to, text);
    },

    async edit(to: string, id: string, text: string): Promise<boolean> {
      if (!session || state !== "connected" || !id) return false;
      return session.edit(to, id, text);
    },

    /** The server is stopping: close the socket, keep the session. */
    close(): void {
      stopTimers();
      generation += 1;
      session?.end();
      session = null;
    },
  };
}

export type WhatsAppConnection = ReturnType<typeof createWhatsAppConnection>;
