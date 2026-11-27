// The e-mails about a customer's space: one when it passes 80% of the plan, one when it reaches 100%. In Portuguese.
import type { MailMessage } from "./mailer.ts";

const GB = 1024 ** 3;

/** "1,5 GB" (binary gigabytes, one decimal at most, pt-BR). */
export function formatGb(bytes: number): string {
  return `${(bytes / GB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
}

export function storageEmail(to: string, input: { level: 80 | 100; usedBytes: number; quotaBytes: number; accountUrl: string }): MailMessage {
  const used = formatGb(input.usedBytes);
  const quota = formatGb(input.quotaBytes);
  const full = input.level === 100;
  const subject = full ? "Seu ArkoBot ficou sem espaço" : "Seu ArkoBot está chegando no limite de espaço";
  const lines = full
    ? [
      `Seu ArkoBot está usando ${used} de ${quota} do seu plano: o espaço acabou.`,
      "",
      "Nada foi apagado e seus bots continuam conversando. Mas, se o uso passar um pouco do limite, o ArkoBot para de aceitar arquivos novos até você liberar espaço.",
      "",
      "Para resolver: apague arquivos que não usa mais no seu ArkoBot, ou mude para um plano com mais espaço.",
    ]
    : [
      `Seu ArkoBot já está usando ${used} de ${quota} do seu plano (mais de 80%).`,
      "",
      "Está tudo funcionando. Só avisamos com antecedência: quando o espaço acabar, o ArkoBot para de aceitar arquivos novos.",
      "",
      "Se quiser, apague arquivos que não usa mais, ou mude para um plano com mais espaço.",
    ];
  return {
    to,
    subject,
    text: ["Olá!", "", ...lines, "", `Sua conta: ${input.accountUrl}`, "", "Equipe ArkoBot · Domma Tecnologia", "https://arkobot.com.br"].join("\n"),
  };
}
