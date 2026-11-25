import { randomBytes } from "node:crypto";
import type { AdminConfig } from "../src/config.ts";
import type { AppContext } from "../src/context.ts";
import { createPgDb, type Db } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { createPgliteDb } from "../src/db/pglite.ts";
import { MemoryMailer } from "../src/mail/mailer.ts";
import { randomToken, SecretBox, sha256Hex } from "../src/security/crypto.ts";
import { createApp } from "../src/server/app.ts";
import { SESSION_TTL_MS, type AdminRole } from "../src/auth/auth.ts";

/**
 * A migrated, empty database. ADMIN_TEST_DATABASE_URL points the suite at a
 * real Postgres (each call gets its own schema, dropped by `close`); without it
 * the suite runs on PGlite, Postgres compiled to WebAssembly, in memory.
 */
export async function testDb(): Promise<Db> {
  const url = process.env.ADMIN_TEST_DATABASE_URL;
  if (!url) {
    const db = await createPgliteDb();
    await migrate(db);
    return db;
  }
  const schema = `t_${randomBytes(6).toString("hex")}`;
  const admin = createPgDb({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.close();
  const db = createPgDb({ connectionString: url, max: 4, searchPath: schema });
  await migrate(db);
  return {
    ...db,
    async close() {
      await db.close();
      const cleanup = createPgDb({ connectionString: url, max: 1 });
      await cleanup.query(`DROP SCHEMA ${schema} CASCADE`);
      await cleanup.close();
    },
  };
}

export const TEST_URL = "https://admin.test";

export function testConfig(overrides: Partial<AdminConfig> = {}): AdminConfig {
  return {
    production: false,
    databaseUrl: "pglite://memory",
    encryptionKey: randomBytes(32).toString("base64"),
    sessionSecret: "s".repeat(48),
    publicUrl: TEST_URL,
    cookieSecure: true,
    cronSecret: "cron-secret-for-tests-0123456789",
    mailFrom: "teste@arkobot.com.br",
    dunning: { suspendAfterDays: 7, cancelAfterDays: 30 },
    ...overrides,
  };
}

export interface TestContext extends AppContext {
  mailer: MemoryMailer;
  clock: { now: Date };
}

export async function testContext(overrides: Partial<AdminConfig> = {}): Promise<TestContext> {
  const config = testConfig(overrides);
  const clock = { now: new Date("2026-11-25T12:00:00Z") };
  return {
    config,
    db: await testDb(),
    box: new SecretBox(config.encryptionKey),
    mailer: new MemoryMailer(),
    now: () => new Date(clock.now),
    clock,
    fetch: globalThis.fetch.bind(globalThis),
  };
}

export function advance(ctx: TestContext, ms: number) {
  ctx.clock.now = new Date(ctx.clock.now.getTime() + ms);
}

export const DAY = 24 * 60 * 60_000;

export async function insertAdmin(ctx: AppContext, email: string, role: AdminRole = "owner"): Promise<string> {
  const { rows } = await ctx.db.query<{ id: string }>("INSERT INTO admins (email, role) VALUES ($1, $2) RETURNING id", [email, role]);
  return rows[0]!.id;
}

/** A logged-in session cookie for a new admin with `role`, without the e-mail round trip. */
export async function sessionCookie(ctx: AppContext, role: AdminRole = "owner", email = `${role}-${randomBytes(3).toString("hex")}@domma.com.br`): Promise<string> {
  const id = await insertAdmin(ctx, email, role);
  const token = randomToken();
  await ctx.db.query("INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [id, sha256Hex(token), new Date(ctx.now().getTime() + SESSION_TTL_MS)]);
  return `arko_admin_session=${token}`;
}

export function client(ctx: AppContext, cookie?: string, ip = "203.0.113.7") {
  const app = createApp(ctx);
  const call = async (method: string, path: string, json?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.request(path, {
      method,
      headers: {
        ...(json === undefined ? {} : { "content-type": "application/json" }),
        ...(method === "GET" ? {} : { origin: TEST_URL }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    }, { incoming: { socket: { remoteAddress: ip } } });
    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  };
  return {
    app,
    get: (path: string, headers?: Record<string, string>) => call("GET", path, undefined, headers),
    post: (path: string, json?: unknown, headers?: Record<string, string>) => call("POST", path, json ?? {}, headers),
    put: (path: string, json?: unknown) => call("PUT", path, json ?? {}),
    del: (path: string) => call("DELETE", path),
  };
}

/** Valid CPF/CNPJ for fixtures (check digits computed). */
export function cpf(base9: string): string {
  const digits = base9.split("").map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i]! * (length + 1 - i);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join("");
}

export function cnpj(base12: string): string {
  const digits = base12.split("").map(Number);
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const sum = weights.reduce((acc, weight, i) => acc + weight * digits[i]!, 0);
    const rest = sum % 11;
    digits.push(rest < 2 ? 0 : 11 - rest);
  }
  return digits.join("");
}
