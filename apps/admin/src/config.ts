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
  /** The customer area's own origin, e.g. https://conta.arkobot.com.br. Served by the same deployment, told apart by host. */
  customerPublicUrl: string;
  customerCookieSecure: boolean;
  /** Sender of the customer e-mails (login codes). */
  customerMailFrom: string;
  /** Bearer secret for GET /api/cron/tick (Vercel Cron sends it as Authorization: Bearer). */
  cronSecret?: string;
  /** A header the edge in front of the Admin overwrites with the client IP (x-real-ip on Vercel). */
  clientIpHeader?: string;
  mailFrom: string;
  /** ADMIN_ALERT_EMAIL: who gets the operational alerts (node down, instance broken); unset: every active owner. */
  alertEmails?: string[];
  /** Resend API key. Without it e-mails (login codes included) only go to the log. */
  resendApiKey?: string;
  /** Development and tests only: send every Asaas call to this base URL (a fake server). */
  asaasBaseUrlOverride?: string;
  dunning: { suspendAfterDays: number; cancelAfterDays: number };
  /** Customer instances (src/provisioning). Unset fields take the defaults in provisioning/settings.ts. */
  provisioning?: {
    /** Each instance answers at https://<slug>.<baseDomain>. */
    baseDomain?: string;
    /** The ArkoBot Cloud home image the agents run. */
    image?: string;
    /** The AI gateway the instances use (OMB_CLOUD_AI_GATEWAY_URL). */
    gatewayUrl?: string;
  };
  /** Computadores próprios (src/computers). Never logged. */
  computers?: {
    /** Hetzner Cloud project token. Each provider is usable only with its credentials; without them nothing is bought there. */
    hetznerApiToken?: string;
    /** Hostinger API token (hPanel → API). */
    hostingerApiToken?: string;
    /** Contabo API client and API user (Customer Control Panel → API). */
    contabo?: { clientId: string; clientSecret: string; apiUser: string; apiPassword: string };
    /** SSH public keys put on every VPS, for the operator's own access. */
    sshKeys?: string[];
    /** Registry login handed to a new VPS at enrollment, when the agent and ArkoBot images are private. */
    registry?: { user: string; token: string };
  };
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

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function alertEmails(raw: string | undefined): string[] | undefined {
  const list = (raw ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const bad = list.find((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  if (bad) throw new ConfigError(`ADMIN_ALERT_EMAIL: "${bad}" não é um e-mail`);
  return list.length ? list : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const production = env.NODE_ENV === "production";
  const publicUrl = (env.ADMIN_PUBLIC_URL?.trim() || "http://localhost:5190").replace(/\/+$/, "");
  const sessionSecret = required(env, "ADMIN_SESSION_SECRET");
  if (sessionSecret.length < 32) throw new ConfigError("ADMIN_SESSION_SECRET precisa ter pelo menos 32 caracteres");
  if (production && !publicUrl.startsWith("https://")) throw new ConfigError("ADMIN_PUBLIC_URL precisa ser https em produção");
  const customerPublicUrl = (env.CUSTOMER_PUBLIC_URL?.trim() || (production ? "https://conta.arkobot.com.br" : "http://localhost:5191")).replace(/\/+$/, "");
  if (production && !customerPublicUrl.startsWith("https://")) throw new ConfigError("CUSTOMER_PUBLIC_URL precisa ser https em produção");
  let customerHost: string;
  try {
    customerHost = new URL(customerPublicUrl).host;
  } catch {
    throw new ConfigError("CUSTOMER_PUBLIC_URL inválida (ex.: https://conta.arkobot.com.br)");
  }
  if (customerHost === hostOf(publicUrl)) throw new ConfigError("CUSTOMER_PUBLIC_URL precisa ter um host diferente de ADMIN_PUBLIC_URL");
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
    customerPublicUrl,
    customerCookieSecure: customerPublicUrl.startsWith("https://"),
    customerMailFrom: env.CUSTOMER_MAIL_FROM?.trim() || "ArkoBot <conta@arkobot.com.br>",
    cronSecret: env.CRON_SECRET?.trim() || undefined,
    clientIpHeader: env.ADMIN_CLIENT_IP_HEADER?.trim().toLowerCase() || (env.VERCEL ? "x-real-ip" : undefined),
    mailFrom: env.ADMIN_MAIL_FROM?.trim() || "ArkoBot Admin <admin@arkobot.com.br>",
    alertEmails: alertEmails(env.ADMIN_ALERT_EMAIL),
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    asaasBaseUrlOverride: env.ASAAS_API_BASE_URL?.trim() || undefined,
    dunning: {
      suspendAfterDays: positiveInt(env.DUNNING_SUSPEND_AFTER_DAYS, 7, "DUNNING_SUSPEND_AFTER_DAYS"),
      cancelAfterDays: positiveInt(env.DUNNING_CANCEL_AFTER_DAYS, 30, "DUNNING_CANCEL_AFTER_DAYS"),
    },
    provisioning: {
      baseDomain: env.INSTANCES_BASE_DOMAIN?.trim() || undefined,
      image: env.INSTANCE_IMAGE?.trim() || undefined,
      gatewayUrl: env.AI_GATEWAY_PUBLIC_URL?.trim() || undefined,
    },
    computers: {
      hetznerApiToken: env.HETZNER_API_TOKEN?.trim() || undefined,
      hostingerApiToken: env.HOSTINGER_API_TOKEN?.trim() || undefined,
      contabo: env.CONTABO_CLIENT_ID?.trim() && env.CONTABO_CLIENT_SECRET?.trim() && env.CONTABO_API_USER?.trim() && env.CONTABO_API_PASSWORD
        ? { clientId: env.CONTABO_CLIENT_ID.trim(), clientSecret: env.CONTABO_CLIENT_SECRET.trim(), apiUser: env.CONTABO_API_USER.trim(), apiPassword: env.CONTABO_API_PASSWORD }
        : undefined,
      sshKeys: (env.VPS_SSH_PUBLIC_KEYS ?? "").split(/\n|;/).map((key) => key.trim()).filter(Boolean),
      registry: env.NODE_REGISTRY_USER?.trim() && env.NODE_REGISTRY_TOKEN?.trim()
        ? { user: env.NODE_REGISTRY_USER.trim(), token: env.NODE_REGISTRY_TOKEN.trim() } : undefined,
    },
  };
}
