// The WhatsApp Web protocol through Baileys (@whiskeysockets/baileys 7.0.0-rc14), loaded at first connect so a server
// that never turns WhatsApp on never loads it. Its session lives in files only the server's user can read; the library's
// own logger is silenced, since its debug lines can carry keys.
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "../atomic.ts";
import type { IncomingText, TransportClose, TransportEvents, TransportSession, WhatsAppTransport } from "./transport.ts";

type Baileys = typeof import("@whiskeysockets/baileys");

const quiet = {
  level: "silent",
  child: () => quiet,
  trace() {}, debug() {}, info() {}, warn() {}, error() {},
};

const fileName = (name: string) => name.replace(/\//g, "__").replace(/:/g, "-");

/** Security invariant: the folder is 0700 and every file 0600, written whole or not at all. */
export function prepareSessionDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch {}
}

export function eraseSession(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function holdsSession(dir: string): boolean {
  try {
    return readdirSync(dir).includes("creds.json");
  } catch {
    return false;
  }
}

async function fileAuthState(lib: Baileys, dir: string) {
  prepareSessionDir(dir);
  const read = (name: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(dir, fileName(name)), "utf8"), lib.BufferJSON.reviver);
    } catch {
      return null;
    }
  };
  const write = (name: string, value: unknown) => writeFileAtomic(join(dir, fileName(name)), JSON.stringify(value, lib.BufferJSON.replacer), { mode: 0o600 });
  const remove = (name: string) => rmSync(join(dir, fileName(name)), { force: true });
  const creds = (read("creds.json") as ReturnType<Baileys["initAuthCreds"]> | null) ?? lib.initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: (type: string, ids: string[]) => {
          const found: Record<string, unknown> = {};
          for (const id of ids) {
            let value = read(`${type}-${id}.json`);
            if (type === "app-state-sync-key" && value) value = lib.proto.Message.AppStateSyncKeyData.fromObject(value as object);
            found[id] = value;
          }
          return found;
        },
        set: (data: Record<string, Record<string, unknown>>) => {
          for (const [category, values] of Object.entries(data)) {
            for (const [id, value] of Object.entries(values)) {
              if (value) write(`${category}-${id}.json`, value);
              else remove(`${category}-${id}.json`);
            }
          }
        },
      },
    },
    save: () => write("creds.json", creds),
  };
}

const digitsOf = (jid: string | null | undefined): string | null => {
  const match = jid ? /^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(jid) : null;
  return match ? match[1]! : null;
};

function closeReason(lib: Baileys, error: unknown): TransportClose {
  const status = (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
  if (status === lib.DisconnectReason.loggedOut) return "logged-out";
  if (status === lib.DisconnectReason.connectionReplaced) return "replaced";
  if (status === lib.DisconnectReason.restartRequired) return "restart";
  return "lost";
}

export const baileysTransport: WhatsAppTransport = {
  async start(sessionDir, events: TransportEvents): Promise<TransportSession> {
    const lib = await import("@whiskeysockets/baileys");
    const auth = await fileAuthState(lib, sessionDir);
    const makeSocket = lib.makeWASocket ?? lib.default;
    // WhatsApp refuses a client revision it considers too old; the library's built-in one ages with each release.
    const latest = await lib.fetchLatestWaWebVersion({ signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const socket = makeSocket({
      ...(latest?.version ? { version: latest.version } : {}),
      auth: auth.state as never,
      logger: quiet as never,
      browser: lib.Browsers.ubuntu("Otávio Bot"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldIgnoreJid: (jid: string) => Boolean(lib.isJidGroup(jid) || lib.isJidBroadcast(jid) || lib.isJidNewsletter(jid) || jid === "status@broadcast"),
    });
    let ended = false;
    socket.ev.on("creds.update", () => auth.save());
    socket.ev.on("connection.update", (update) => {
      if (ended) return;
      if (update.qr) events.qr(update.qr);
      if (update.connection === "open") events.open(digitsOf(lib.jidNormalizedUser(socket.user?.id)) ?? "");
      if (update.connection === "close") {
        ended = true;
        const error = update.lastDisconnect?.error;
        events.close(closeReason(lib, error), error instanceof Error ? error.message : undefined);
      }
    });
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        const key = message.key;
        const chat = key.remoteJid ?? "";
        const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? "";
        if (!chat || !text) continue;
        const group = Boolean(lib.isJidGroup(chat));
        const broadcast = Boolean(lib.isJidBroadcast(chat) || lib.isJidNewsletter(chat) || chat === "status@broadcast");
        const sender = group || broadcast ? null : digitsOf(chat) ?? digitsOf(key.remoteJidAlt);
        const incoming: IncomingText = { chat, sender, text, fromMe: Boolean(key.fromMe), group, broadcast };
        events.message(incoming);
      }
    });
    const jidOf = (digits: string) => `${digits}@s.whatsapp.net`;
    return {
      async send(to, text) {
        const sent = await socket.sendMessage(jidOf(to), { text });
        return sent?.key.id ?? "";
      },
      async edit(to, id, text) {
        try {
          await socket.sendMessage(jidOf(to), { text, edit: { remoteJid: jidOf(to), fromMe: true, id } });
          return true;
        } catch {
          return false;
        }
      },
      async logout() {
        ended = true;
        try { await socket.logout(); } catch {}
      },
      end() {
        ended = true;
        socket.end(undefined);
      },
    };
  },
};
