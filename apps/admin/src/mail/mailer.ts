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
