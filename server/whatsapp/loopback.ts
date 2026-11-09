// A transport that talks to a stand-in WhatsApp on this machine (server/testing/fake-whatsapp.ts) instead of the real
// one, for the isolated fixture. Taken only when OMB_WHATSAPP_FAKE_URL is a ws://127.0.0.1 address.
import { randomUUID } from "node:crypto";

import { WebSocket } from "ws";

import { writeFileAtomic } from "../atomic.ts";
import { holdsSession, prepareSessionDir } from "./baileys.ts";
import type { IncomingText, TransportClose, TransportEvents, TransportSession, WhatsAppTransport } from "./transport.ts";

type FromFake =
  | { type: "qr"; code: string }
  | { type: "open"; number: string }
  | { type: "close"; reason: TransportClose }
  | ({ type: "message" } & IncomingText);

/** The fake's address when the environment names a loopback one, else null. */
export function loopbackWhatsAppUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.OMB_WHATSAPP_FAKE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "ws:" && url.hostname === "127.0.0.1" && url.port ? url.toString() : null;
  } catch {
    return null;
  }
}

export function loopbackTransport(url: string): WhatsAppTransport {
  return {
    async start(sessionDir, events: TransportEvents): Promise<TransportSession> {
      prepareSessionDir(sessionDir);
      const socket = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      let ended = false;
      socket.on("message", (raw) => {
        if (ended) return;
        const frame = JSON.parse(String(raw)) as FromFake;
        if (frame.type === "qr") events.qr(frame.code);
        else if (frame.type === "open") {
          writeFileAtomic(`${sessionDir}/creds.json`, JSON.stringify({ linked: frame.number }), { mode: 0o600 });
          events.open(frame.number);
        } else if (frame.type === "close") {
          ended = true;
          events.close(frame.reason);
          socket.close();
        } else if (frame.type === "message") {
          const { type: _type, ...message } = frame;
          events.message(message);
        }
      });
      socket.on("close", () => {
        if (ended) return;
        ended = true;
        events.close("lost");
      });
      const post = (frame: Record<string, unknown>) => socket.send(JSON.stringify(frame));
      post({ type: "start", linked: holdsSession(sessionDir) });
      return {
        async send(to, text) {
          const id = randomUUID();
          post({ type: "send", to, text, id });
          return id;
        },
        async edit(to, id, text) {
          post({ type: "edit", to, id, text });
          return true;
        },
        async logout() {
          ended = true;
          post({ type: "logout" });
          socket.close();
        },
        end() {
          ended = true;
          socket.close();
        },
      };
    },
  };
}
