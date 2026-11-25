export interface AdminConfig {
  production: boolean;
  databaseUrl: string;
  databaseSsl?: string;
  encryptionKey: string;
  encryptionKeyPrevious?: string;
  /** Keys the HMACs of OTP codes and rate-limit buckets. */
  sessionSecret: string;
  /** The panel's own origin, e.g. https://admin.arkobot.com.br. State-changing requests must come from it. */
  publicUrl: string;
  cookieSecure: boolean;
  /** Bearer secret for GET /api/cron/tick (Vercel Cron sends it as Authorization: Bearer). */
  cronSecret?: string;
  /** A header the edge in front of the Admin overwrites with the client IP (x-real-ip on Vercel). */
  clientIpHeader?: string;
  mailFrom: string;
  /** Resend API key. Without it e-mails (login codes included) only go to the log. */
  resendApiKey?: string;
  /** Development and tests only: send every Asaas call to this base URL (a fake server). */
  asaasBaseUrlOverride?: string;
  dunning: { suspendAfterDays: number; cancelAfterDays: number };
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Defina a variável de ambiente ${name} (veja apps/admin/.env.example).`);
  return value;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new ConfigError(`${name} precisa ser um inteiro positivo`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const production = env.NODE_ENV === "production";
  const publicUrl = (env.ADMIN_PUBLIC_URL?.trim() || "http://localhost:5190").replace(/\/+$/, "");
  const sessionSecret = required(env, "ADMIN_SESSION_SECRET");
  if (sessionSecret.length < 32) throw new ConfigError("ADMIN_SESSION_SECRET precisa ter pelo menos 32 caracteres");
  if (production && !publicUrl.startsWith("https://")) throw new ConfigError("ADMIN_PUBLIC_URL precisa ser https em produção");
  if (production && env.ASAAS_API_BASE_URL) throw new ConfigError("ASAAS_API_BASE_URL é só para desenvolvimento e testes");
  return {
    production,
    databaseUrl: required(env, "DATABASE_URL"),
    databaseSsl: env.DATABASE_SSL,
    encryptionKey: required(env, "ADMIN_ENCRYPTION_KEY"),
    encryptionKeyPrevious: env.ADMIN_ENCRYPTION_KEY_PREVIOUS?.trim() || undefined,
    sessionSecret,
    publicUrl,
    cookieSecure: publicUrl.startsWith("https://"),
    cronSecret: env.CRON_SECRET?.trim() || undefined,
    clientIpHeader: env.ADMIN_CLIENT_IP_HEADER?.trim().toLowerCase() || (env.VERCEL ? "x-real-ip" : undefined),
    mailFrom: env.ADMIN_MAIL_FROM?.trim() || "ArkoBot Admin <admin@arkobot.com.br>",
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    asaasBaseUrlOverride: env.ASAAS_API_BASE_URL?.trim() || undefined,
    dunning: {
      suspendAfterDays: positiveInt(env.DUNNING_SUSPEND_AFTER_DAYS, 7, "DUNNING_SUSPEND_AFTER_DAYS"),
      cancelAfterDays: positiveInt(env.DUNNING_CANCEL_AFTER_DAYS, 30, "DUNNING_CANCEL_AFTER_DAYS"),
    },
  };
}
