export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outgoing e-mail. A real provider (Resend, SES, SMTP) plugs in here later. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  readonly from: string;
  constructor(from: string) {
    this.from = from;
  }
  async send(message: MailMessage): Promise<void> {
    console.log(`\n[mailer:console] De: ${this.from}\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
  }
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  readonly from: string;
  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #baseUrl: string;
  constructor(options: { apiKey: string; from: string; fetch: FetchLike; baseUrl?: string }) {
    this.#apiKey = options.apiKey;
    this.from = options.from;
    this.#fetch = options.fetch;
    this.#baseUrl = (options.baseUrl ?? "https://api.resend.com").replace(/\/+$/, "");
  }
  async send(message: MailMessage): Promise<void> {
    const response = await this.#fetch(`${this.#baseUrl}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`O Resend recusou o e-mail (HTTP ${response.status}): ${detail}`);
    }
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export function otpEmail(to: string, code: string): MailMessage {
  const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;
  return {
    to,
    subject: `Seu código de acesso ao ArkoBot Admin: ${pretty}`,
    text: `Use este código para entrar na Central de Administrador do ArkoBot:\n\n    ${pretty}\n\nEle vale por 10 minutos. Se não foi você, ignore este e-mail.`,
  };
}
