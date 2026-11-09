// The owner's WhatsApp line: the connection's state as Settings shows it, what the owner chose to hear about, and how a
// reply typed on the phone is read back into a card's answer.

/** "off": never connected, or disconnected and its session erased. "connecting": opening the session. "waiting-qr": a
 * QR code is up for the owner to scan. "connected": linked and listening. "reconnecting": the link dropped and it
 * retries on its own. "logged-out": the phone ended this session (WhatsApp → Linked devices); its session is erased. */
export type WhatsAppState = "off" | "connecting" | "waiting-qr" | "connected" | "reconnecting" | "logged-out";

/** Which news goes to WhatsApp. `approvals`: a bot's approval cards and questions; `budget`: a company's (or the
 * workspace's) spend at its warning share or cap; `problems`: a bot's failed or stalled run. */
export interface WhatsAppNotify {
  approvals: boolean;
  budget: boolean;
  problems: boolean;
}

export const DEFAULT_WHATSAPP_NOTIFY: WhatsAppNotify = { approvals: true, budget: true, problems: false };

/** What `GET /api/whatsapp` answers, to an owner or admin only. `qr` is the code's text while `state` is "waiting-qr":
 * the page draws it; scanning it links a device, so it never reaches anyone else. `linkedNumber`: the bot's own number
 * once connected. `ownerNumber`: the number that may answer, digits only. */
export interface WhatsAppStatus {
  state: WhatsAppState;
  qr?: string;
  linkedNumber?: string;
  ownerNumber?: string;
  notify: WhatsAppNotify;
  /** Why the last try failed, in plain words, when it did. */
  problem?: string;
}

/** `PUT /api/whatsapp/settings`. */
export interface WhatsAppSettingsInput {
  ownerNumber?: string;
  notify?: Partial<WhatsAppNotify>;
}

/** A phone number as digits only, country code first: "+55 (11) 98765-4321" and "5511987654321" are the same number.
 * A leading "00" international prefix is dropped. */
export function phoneDigits(text: string): string {
  const digits = text.replace(/\D/g, "");
  return text.trim().startsWith("00") ? digits.replace(/^00/, "") : digits;
}

/** International format: a country code and number, 10 to 15 digits (E.164), led by "+" or "00" unless the digits alone
 * are long enough to hold a country code. */
export function validOwnerNumber(text: string): boolean {
  const digits = phoneDigits(text);
  const shape = /^\s*(\+|00)?[\d\s().-]+$/.exec(text);
  return Boolean(shape) && /^[1-9]\d{9,14}$/.test(digits) && (Boolean(shape![1]) || digits.length >= 12);
}

/** Brazil's mobile numbers gained a ninth digit (a 9 after the area code); WhatsApp still names many accounts by the
 * older eight-digit form. Both forms of a Brazilian mobile are the same person. */
function brazilForms(digits: string): string[] {
  if (/^55\d{2}9\d{8}$/.test(digits)) return [digits, digits.slice(0, 4) + digits.slice(5)];
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) return [digits, `${digits.slice(0, 4)}9${digits.slice(4)}`];
  return [digits];
}

/** Security invariant: only the owner's own number answers cards; the comparison is on normalized digits only. */
export function sameNumber(a: string, b: string): boolean {
  const left = phoneDigits(a), right = phoneDigits(b);
  if (!left || !right) return false;
  return brazilForms(left).includes(right);
}

/** "+55 11 98765-4321" for the screen, from digits. */
export function displayNumber(digits: string): string {
  const d = phoneDigits(digits);
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return d ? `+${d}` : "";
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}#\s]/gu, " ").replace(/\s+/g, " ").trim();

const YES_WORDS = new Set(["sim", "s", "aprovar", "aprovo", "aprovado", "pode", "ok", "yes", "y", "allow", "ja", "liberar", "libera"]);
const NO_WORDS = new Set(["nao", "n", "recusar", "recuso", "recusado", "negar", "nego", "no", "deny", "nein", "nao pode"]);

/** A reference like "#A7": a letter and a number, printed with each message so a reply can name its card. */
export const REFERENCE = /(?:^|\s)#?([a-z])(\d{1,3})(?=\s|$)/i;

export interface ParsedReply {
  /** "A7", upper case, when the reply named one. */
  reference?: string;
  /** What is left once the reference is taken out, folded: no accents, lower case, single spaces. */
  answer: string;
}

/** Splits a reply like "#A7 1", "a7 sim" or "Sim" into its reference and its answer. */
export function parseReply(text: string): ParsedReply {
  const folded = fold(text);
  const match = REFERENCE.exec(folded);
  if (!match) return { answer: folded };
  const reference = `${match[1]!.toUpperCase()}${Number(match[2])}`;
  const answer = (folded.slice(0, match.index) + " " + folded.slice(match.index + match[0].length)).replace(/#/g, " ").replace(/\s+/g, " ").trim();
  return { reference, answer };
}

/** Which offered choice an answer picks: its number ("1"), its words, or yes/no; null when it picks none. `choices` are
 * the options as numbered in the message; `yes`/`no` are the indexes that mean approve and decline, when there are. */
export function pickChoice(answer: string, choices: readonly string[], meaning: { yes?: number; no?: number } = {}): number | null {
  const plain = fold(answer);
  if (!plain) return null;
  if (/^\d{1,2}$/.test(plain)) {
    const index = Number(plain) - 1;
    return index >= 0 && index < choices.length ? index : null;
  }
  const exact = choices.findIndex((choice) => fold(choice) === plain);
  if (exact >= 0) return exact;
  if (YES_WORDS.has(plain) && meaning.yes !== undefined) return meaning.yes;
  if (NO_WORDS.has(plain) && meaning.no !== undefined) return meaning.no;
  return null;
}
