import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url));
const LOCK_ID = 727_001_201;

export interface Migration {
  version: string;
  sql: string;
}

export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => ({ version: name.replace(/\.sql$/, ""), sql: readFileSync(join(dir, name), "utf8") }));
}

/** Applies pending migrations in order, each in its own transaction, under an advisory lock. */
export async function migrate(db: Db, migrations = loadMigrations()): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  return db.tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
    const { rows } = await q.query<{ version: string }>("SELECT version FROM schema_migrations");
    const done = new Set(rows.map((row) => row.version));
    const applied: string[] = [];
    for (const migration of migrations) {
      if (done.has(migration.version)) continue;
      await q.query(migration.sql);
      await q.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
      applied.push(migration.version);
    }
    return applied;
  });
}
