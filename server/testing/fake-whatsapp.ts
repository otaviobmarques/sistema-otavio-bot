// A stand-in WhatsApp on this machine for the isolated fixture: the server's loopback transport
// (server/whatsapp/loopback.ts, through OMB_WHATSAPP_FAKE_URL) links to it instead of the real service. A test shows the
// QR code, "scans" it, writes as the owner or anyone else, and reads every message the server sent.
import type { AddressInfo } from "node:net";

import { WebSocket, WebSocketServer } from "ws";

export interface FakeSent { to: string; text: string; id: string }

export async function startFakeWhatsApp(options: { linkedNumber: string }) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const sent: FakeSent[] = [];
  const edits: FakeSent[] = [];
  let socket: WebSocket | null = null;
  let qrCount = 0;
  let loggedOut = false;
  const waiters = new Set<() => void>();
  const changed = () => { for (const wake of waiters) wake(); };
  const post = (frame: Record<string, unknown>) => socket?.send(JSON.stringify(frame));

  server.on("connection", (connection) => {
    socket = connection;
    connection.on("message", (raw) => {
      const frame = JSON.parse(String(raw)) as { type: string; linked?: boolean; to?: string; text?: string; id?: string };
      if (frame.type === "start") {
        if (frame.linked) post({ type: "open", number: options.linkedNumber });
        else post({ type: "qr", code: `2@fake-whatsapp-qr-${++qrCount},fixture-only` });
      } else if (frame.type === "send") sent.push({ to: frame.to!, text: frame.text!, id: frame.id! });
      else if (frame.type === "edit") edits.push({ to: frame.to!, text: frame.text!, id: frame.id! });
      else if (frame.type === "logout") loggedOut = true;
      changed();
    });
    connection.on("close", () => { if (socket === connection) socket = null; changed(); });
    changed();
  });

  async function until<T>(read: () => T | undefined | false, timeoutMs = 15_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = read();
      if (value) return value;
      if (Date.now() > deadline) throw new Error("the fake WhatsApp waited too long");
      await new Promise<void>((resolve) => {
        const wake = () => { waiters.delete(wake); resolve(); };
        waiters.add(wake);
        setTimeout(wake, 100);
      });
    }
  }

  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sent,
    edits,
    get connected() { return socket !== null; },
    get loggedOut() { return loggedOut; },
    scan() { post({ type: "open", number: options.linkedNumber }); },
    /** A text arriving at the linked account. */
    receive(message: { sender: string | null; text: string; group?: boolean; broadcast?: boolean; chat?: string }) {
      post({ type: "message", chat: message.chat ?? `${message.sender}@s.whatsapp.net`, sender: message.sender, text: message.text, fromMe: false, group: Boolean(message.group), broadcast: Boolean(message.broadcast) });
    },
    endFromPhone() { post({ type: "close", reason: "logged-out" }); },
    until,
    /** The next message the server sends after `count` were sent. */
    sentAfter(count: number, timeoutMs?: number) { return until(() => sent.length > count && sent[count], timeoutMs); },
    async close() {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export type FakeWhatsApp = Awaited<ReturnType<typeof startFakeWhatsApp>>;
