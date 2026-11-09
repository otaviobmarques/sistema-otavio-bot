// The one seam between a WhatsApp protocol library and the rest of the server: everything above it sees only these
// events and calls, so the approvals and the connection's lifecycle run the same against the fake in tests.

/** A text the linked account received. `sender`: the sender's phone number as digits when the protocol gave one; null
 * when it named the sender only by a private id. `group`, `broadcast`: a group chat, a status update, a newsletter or a
 * broadcast list, which nothing here answers. */
export interface IncomingText {
  chat: string;
  sender: string | null;
  text: string;
  fromMe: boolean;
  group: boolean;
  broadcast: boolean;
}

/** "restart": the protocol asks for a fresh socket at once, as it does right after a QR code is scanned. */
export type TransportClose = "logged-out" | "replaced" | "restart" | "lost";

export interface TransportEvents {
  qr(code: string): void;
  open(linkedNumber: string): void;
  close(reason: TransportClose, detail?: string): void;
  message(message: IncomingText): void;
}

export interface TransportSession {
  /** Sends a text to a phone number (digits); resolves with the message's id, for a later edit. */
  send(to: string, text: string): Promise<string>;
  /** Replaces the words of a message this account sent; false when the protocol could not. */
  edit(to: string, id: string, text: string): Promise<boolean>;
  /** Unlinks this device on the phone too; the stored session is then useless. */
  logout(): Promise<void>;
  /** Closes the socket and keeps the session for the next start. */
  end(): void;
}

export interface WhatsAppTransport {
  /** Opens a session from the folder (the owner's eyes only), asking for a QR code when it holds none. */
  start(sessionDir: string, events: TransportEvents): Promise<TransportSession>;
}
