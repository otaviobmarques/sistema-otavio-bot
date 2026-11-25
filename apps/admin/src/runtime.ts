import { loadConfig, type AdminConfig } from "./config.ts";
import type { AppContext } from "./context.ts";
import { createPgDb, sslFor } from "./db/db.ts";
import { ConsoleMailer } from "./mail/mailer.ts";
import { SecretBox } from "./security/crypto.ts";

/** The production context: Postgres from DATABASE_URL, secrets sealed with ADMIN_ENCRYPTION_KEY. */
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
    mailer: new ConsoleMailer(config.mailFrom),
    now: () => new Date(),
    fetch: globalThis.fetch.bind(globalThis),
  };
}
