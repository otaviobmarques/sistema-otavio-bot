import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { removeTempDir } from "../testing/cleanup.ts";
import { createWhatsAppConnection, RECONNECT_DELAYS_MS } from "./connection.ts";
import { createOutbox } from "./outbox.ts";
import type { TransportEvents, WhatsAppTransport } from "./transport.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) removeTempDir(dir); });

function fakeTransport() {
  const runs: Array<{ events: TransportEvents; sent: Array<{ to: string; text: string }>; loggedOut: boolean; ended: boolean }> = [];
  const transport: WhatsAppTransport = {
    async start(_sessionDir, events) {
      const run = { events, sent: [] as Array<{ to: string; text: string }>, loggedOut: false, ended: false };
      runs.push(run);
      return {
        send: async (to, text) => { run.sent.push({ to, text }); return `id${run.sent.length}`; },
        edit: async () => true,
        logout: async () => { run.loggedOut = true; },
        end: () => { run.ended = true; },
      };
    },
  };
  return { transport, runs };
}

function setup(dataDir = mkdtempSync(join(tmpdir(), "omb-whatsapp-")), { transport, runs } = fakeTransport()) {
  dirs.push(dataDir);
  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
  const messages: unknown[] = [];
  const connection = createWhatsAppConnection({
    dataDir, transport: () => transport, message: (message) => messages.push(message),
    later: (run, ms) => { const timer = { run, ms, cancelled: false }; timers.push(timer); return { cancel: () => { timer.cancelled = true; } }; },
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const linkSession = () => { mkdirSync(connection.sessionDir, { recursive: true }); writeFileSync(join(connection.sessionDir, "creds.json"), "{}", { mode: 0o600 }); };
  return { dataDir, connection, runs, timers, messages, flush, linkSession };
}

describe("the WhatsApp link", () => {
  it("is off and loads nothing until Connect", () => {
    const { connection, runs } = setup();
    connection.boot();
    expect(connection.status()).toEqual({ state: "off", notify: { approvals: true, budget: true, problems: false } });
    expect(runs).toEqual([]);
  });

  it("shows the QR code, then the linked number, keeping its settings and folder private", async () => {
    const { connection, runs, flush, dataDir } = setup();
    connection.connect();
    await flush();
    runs[0]!.events.qr("2@fake-qr");
    expect(connection.status()).toMatchObject({ state: "waiting-qr", qr: "2@fake-qr" });
    runs[0]!.events.open("5511900001111");
    expect(connection.status()).toMatchObject({ state: "connected", linkedNumber: "5511900001111" });
    expect(connection.status().qr).toBeUndefined();
    expect(statSync(join(dataDir, "whatsapp")).mode & 0o777).toBe(0o700);
    expect(statSync(join(dataDir, "whatsapp", "settings.json")).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(join(dataDir, "whatsapp", "settings.json"), "utf8"))).toMatchObject({ enabled: true });
  });

  it("starts again at once after the scan's restart, and retries a dropped link with a growing wait", async () => {
    const { connection, runs, flush, timers, linkSession } = setup();
    connection.connect();
    await flush();
    linkSession();
    runs[0]!.events.close("restart");
    await flush();
    expect(runs).toHaveLength(2);
    runs[1]!.events.open("5511900001111");
    runs[1]!.events.close("lost");
    expect(connection.status().state).toBe("reconnecting");
    expect(timers.at(-1)!.ms).toBe(RECONNECT_DELAYS_MS[0]);
    timers.at(-1)!.run();
    await flush();
    runs[2]!.events.close("lost");
    expect(timers.at(-1)!.ms).toBe(RECONNECT_DELAYS_MS[1]);
    timers.at(-1)!.run();
    await flush();
    runs[3]!.events.open("5511900001111");
    runs[3]!.events.close("lost");
    expect(timers.at(-1)!.ms).toBe(RECONNECT_DELAYS_MS[0]);
  });

  it("gives up on a QR code nobody scanned", async () => {
    const { connection, runs, flush } = setup();
    connection.connect();
    await flush();
    runs[0]!.events.qr("2@x");
    runs[0]!.events.close("lost");
    expect(connection.status()).toMatchObject({ state: "off", problem: "qr-expired" });
  });

  it("erases the session when the phone ends it, and when the owner disconnects", async () => {
    const { connection, runs, flush, linkSession } = setup();
    connection.connect();
    await flush();
    linkSession();
    runs[0]!.events.open("5511900001111");
    runs[0]!.events.close("logged-out");
    expect(connection.status().state).toBe("logged-out");
    expect(existsSync(connection.sessionDir)).toBe(false);
    connection.connect();
    await flush();
    linkSession();
    runs[1]!.events.open("5511900001111");
    await connection.disconnect();
    expect(runs[1]!.loggedOut).toBe(true);
    expect(existsSync(connection.sessionDir)).toBe(false);
    expect(connection.status().state).toBe("off");
  });

  it("links again at start when it was left on with a session", async () => {
    const first = setup();
    first.connection.connect();
    await first.flush();
    first.linkSession();
    const shared = fakeTransport();
    const again = setup(first.dataDir, shared);
    again.connection.boot();
    await again.flush();
    expect(shared.runs).toHaveLength(1);
    expect(again.connection.status().state).toBe("connecting");
  });

  it("refuses a number that is not international and keeps the digits of one that is", () => {
    const { connection } = setup();
    expect(connection.update({ ownerNumber: "98765-4321" })).toEqual({ ok: false, code: "serverError.whatsapp.invalidNumber" });
    expect(connection.update({ ownerNumber: "+55 11 98765-4321", notify: { problems: true } })).toMatchObject({ ok: true, status: { ownerNumber: "5511987654321", notify: { approvals: true, budget: true, problems: true } } });
  });

  it("only passes on messages while connected", async () => {
    const { connection, runs, flush, messages } = setup();
    connection.connect();
    await flush();
    const text = { chat: "x", sender: "1", text: "1", fromMe: false, group: false, broadcast: false };
    runs[0]!.events.message(text);
    runs[0]!.events.open("5511900001111");
    runs[0]!.events.message(text);
    expect(messages).toEqual([text]);
  });
});

describe("the outbox", () => {
  it("spaces messages out and holds the ones past the hourly cap", async () => {
    let now = 0;
    const waits: Array<{ run: () => void; ms: number }> = [];
    const delivered: string[] = [];
    const outbox = createOutbox(async (text) => { delivered.push(text); return text; }, { gapMs: 4_000, perHour: 2 }, { now: () => now, later: (run, ms) => waits.push({ run, ms }) });
    const all = ["a", "b", "c"].map((text) => outbox.send(text));
    await Promise.resolve();
    await Promise.resolve();
    expect(delivered).toEqual(["a"]);
    expect(waits.at(-1)!.ms).toBe(4_000);
    now = 4_000;
    waits.at(-1)!.run();
    await new Promise((resolve) => setImmediate(resolve));
    expect(delivered).toEqual(["a", "b"]);
    expect(waits.at(-1)!.ms).toBe(60 * 60_000 - 4_000);
    now = 60 * 60_000;
    waits.at(-1)!.run();
    expect(await Promise.all(all)).toEqual(["a", "b", "c"]);
  });
});
