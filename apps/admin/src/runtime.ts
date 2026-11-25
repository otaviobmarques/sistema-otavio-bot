import { loadConfig, type AdminConfig } from "./config.ts";
import type { AppContext } from "./context.ts";
import { createPgDb, sslFor } from "./db/db.ts";
import { ConsoleMailer, ResendMailer, type Mailer } from "./mail/mailer.ts";
import { SecretBox } from "./security/crypto.ts";

/** The production context: Postgres from DATABASE_URL, secrets sealed with ADMIN_ENCRYPTION_KEY. */
function mailerFor(config: AdminConfig): Mailer {
  if (config.resendApiKey) return new ResendMailer({ apiKey: config.resendApiKey, from: config.mailFrom, fetch: globalThis.fetch.bind(globalThis) });
  if (config.production) console.warn("RESEND_API_KEY não definida: os e-mails, inclusive os códigos de login, vão só para o log.");
  return new ConsoleMailer(config.mailFrom);
}

export function createRuntime(env: NodeJS.ProcessEnv = process.env, config: AdminConfig = loadConfig(env)): AppContext {
  return {
    config,
    db: createPgDb({
      connectionString: config.databaseUrl,
      ssl: sslFor(config.databaseUrl, config.databaseSsl),
      // A serverless function serves one request at a time; a long-lived server can hold more.
      max: env.VERCEL ? 1 : 5,
    }),
    box: new SecretBox(config.encryptionKey, config.encryptionKeyPrevious),
    mailer: mailerFor(config),
    now: () => new Date(),
    fetch: globalThis.fetch.bind(globalThis),
  };
}
