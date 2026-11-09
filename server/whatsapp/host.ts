// Puts the owner's WhatsApp together: the link, the rate-limited outbox to the owner's number, and the approvals that
// ride on it. Nothing here runs, and the protocol library never loads, until the owner presses Connect.
import type { Notification } from "../../shared/notification.ts";
import type { LoopbackTrust, RequestAuth } from "../request-auth.ts";
import type { Store } from "../store.ts";
import { createWhatsAppApprovals, type CardAnswer } from "./approvals.ts";
import { baileysTransport } from "./baileys.ts";
import { createWhatsAppConnection } from "./connection.ts";
import { loopbackTransport, loopbackWhatsAppUrl } from "./loopback.ts";
import { createOutbox } from "./outbox.ts";
import type { WhatsAppTransport } from "./transport.ts";

export interface WhatsAppHostDeps {
  dataDir: string;
  store: Store;
  /** The app's own answer to a card (what POST /api/threads/<id>/respond runs), as `auth`, recorded as from WhatsApp. */
  answerCard(input: { auth: RequestAuth; threadId: string; requestId: string } & CardAnswer): Promise<{ status: number; body: unknown }>;
  /** How far this machine trusts its own loopback: WhatsApp answers as the owner here does, never with more. */
  loopbackTrust: LoopbackTrust;
  companyOf(botId: string): string | undefined;
  allowed(threadId: string): boolean;
  language(threadId: string): string | undefined;
  transport?: WhatsAppTransport;
  env?: NodeJS.ProcessEnv;
}

/** The owner on this machine, as the desktop app's own requests are. */
export function whatsAppAuth(trust: LoopbackTrust): RequestAuth {
  return trust === "service" ? { kind: "loopback", scopes: ["client"], trust: "service" } : { kind: "loopback", scopes: ["admin", "client"] };
}

export function createWhatsApp(deps: WhatsAppHostDeps) {
  const fake = loopbackWhatsAppUrl(deps.env ?? process.env);
  const transport = deps.transport ?? (fake ? loopbackTransport(fake) : baileysTransport);
  let approvals: ReturnType<typeof createWhatsAppApprovals> | null = null;
  const connection = createWhatsAppConnection({
    dataDir: deps.dataDir,
    transport: () => transport,
    message: (message) => void approvals?.received(message),
  });
  const owner = () => connection.settings().ownerNumber;
  const outbox = createOutbox(async (text) => {
    const to = owner();
    return to ? connection.send(to, text) : null;
  });
  const auth = whatsAppAuth(deps.loopbackTrust);
  approvals = createWhatsAppApprovals({
    store: deps.store,
    settings: () => connection.settings(),
    connected: () => connection.connected(),
    send: (text) => outbox.send(text),
    edit: async (id, text) => {
      const to = owner();
      return to ? connection.edit(to, id, text) : false;
    },
    answer: async (input) => {
      const { status, body } = await deps.answerCard({ ...input, auth });
      const reply = (body ?? {}) as { ok?: boolean; outcome?: string; error?: string };
      if (status < 300 && reply.ok !== false && reply.outcome !== "unavailable") return { ok: true };
      return { ok: false, error: reply.error ?? (reply.outcome === "unavailable" ? "The request is no longer open." : `HTTP ${status}`) };
    },
    companyOf: deps.companyOf,
    allowed: deps.allowed,
    language: deps.language,
  });
  connection.boot();

  return {
    connection,
    approvals,
    notification(notification: Notification): void {
      approvals?.notification(notification);
    },
    async disconnect() {
      outbox.clear();
      return connection.disconnect();
    },
    close(): void {
      approvals?.stop();
      connection.close();
    },
  };
}

export type WhatsAppHost = ReturnType<typeof createWhatsApp>;
