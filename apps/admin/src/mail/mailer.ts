export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Overrides the mailer's default sender (the customer area sends as "ArkoBot", the panel as "ArkoBot Admin"). */
  from?: string;
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
    console.log(`\n[mailer:console] De: ${message.from ?? this.from}\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
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
      body: JSON.stringify({ from: message.from ?? this.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }),
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

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The customer area's login/signup code, in Portuguese, with the ArkoBot look. */
export function customerOtpEmail(to: string, code: string): MailMessage {
  const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;
  return {
    to,
    subject: `Seu código de acesso ao ArkoBot: ${pretty}`,
    text: [
      "Olá!",
      "",
      "Use este código para entrar na sua conta do ArkoBot:",
      "",
      `    ${pretty}`,
      "",
      "Ele vale por 10 minutos. Se você não pediu este código, pode ignorar este e-mail: ninguém entra na sua conta sem ele.",
      "",
      "Equipe ArkoBot · Domma Tecnologia",
      "https://arkobot.com.br",
    ].join("\n"),
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6fb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e8f1">
<tr><td style="background:#050817;padding:20px 28px;font-size:22px;font-weight:800;letter-spacing:-0.5px"><span style="color:#ffffff">arko</span><span style="color:#00e8f8">bot</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:16px">Olá!</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Use este código para entrar na sua conta do ArkoBot:</p>
<p style="margin:0 0 20px;text-align:center;font-family:'JetBrains Mono',Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:6px;background:#e3fbfd;color:#0786a0;border-radius:12px;padding:14px 0">${escapeHtml(pretty)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b">Ele vale por 10 minutos. Se você não pediu este código, pode ignorar este e-mail: ninguém entra na sua conta sem ele.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e4e8f1;font-size:12px;color:#64748b">Equipe ArkoBot · Domma Tecnologia · <a href="https://arkobot.com.br" style="color:#0786a0">arkobot.com.br</a></td></tr>
</table></td></tr></table></body></html>`,
  };
}
