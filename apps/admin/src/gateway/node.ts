// The AI gateway as its own long-running Node server (a VPS or a container), apart from the Admin's serverless functions:
// a model's answer can stream for many minutes, longer than a Vercel function may run.
import { serve } from "@hono/node-server";
import { loadDotEnv } from "../cli/env.ts";
import { ConfigError } from "../config.ts";
import { createPgDb, sslFor } from "../db/db.ts";
import { SecretBox } from "../security/crypto.ts";
import { LogUsageAlertNotifier } from "./alerts.ts";
import { createGatewayApp } from "./app.ts";

loadDotEnv();
const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`Defina a variável de ambiente ${name} (veja apps/admin/.env.example).`);
  return value;
};

const databaseUrl = required("DATABASE_URL");
const db = createPgDb({ connectionString: databaseUrl, ssl: sslFor(databaseUrl, process.env.DATABASE_SSL), max: Number(process.env.GATEWAY_DB_POOL) || 10 });
const gateway = createGatewayApp({
  db,
  box: new SecretBox(required("ADMIN_ENCRYPTION_KEY"), process.env.ADMIN_ENCRYPTION_KEY_PREVIOUS?.trim() || undefined),
  now: () => new Date(),
  fetch: globalThis.fetch.bind(globalThis),
  notifier: new LogUsageAlertNotifier(),
});

const port = Number(process.env.GATEWAY_PORT) || 8791;
const hostname = process.env.GATEWAY_HOST || "127.0.0.1";
const server = serve({ fetch: gateway.app.fetch, port, hostname }, () => {
  console.log(`[gateway] gateway de IA em http://${hostname}:${port}`);
});

const stop = async () => {
  server.close();
  await gateway.drain();
  await db.close();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
