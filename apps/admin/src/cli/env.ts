import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPgDb, sslFor, type Db } from "../db/db.ts";

/** Loads apps/admin/.env for local commands; variables already set win. */
export function loadDotEnv(): void {
  const file = fileURLToPath(new URL("../../.env", import.meta.url));
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function cliDb(): Db {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL (em apps/admin/.env ou no ambiente).");
    process.exit(1);
  }
  return createPgDb({ connectionString: url, ssl: sslFor(url, process.env.DATABASE_SSL), max: 1 });
}
