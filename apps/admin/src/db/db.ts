import pg from "pg";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction; a throw rolls it back. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// bigint columns (credits, ids) stay well inside Number's safe range.
pg.types.setTypeParser(20, (value) => Number(value));
// A calendar date (due dates) stays "YYYY-MM-DD": a Date would shift it by the server's time zone.
pg.types.setTypeParser(1082, (value) => value);

export interface PgOptions {
  connectionString: string;
  max?: number;
  /** Supabase and most managed Postgres require TLS; local development usually does not. */
  ssl?: SslMode;
  /** Tests isolate each run in its own schema. */
  searchPath?: string;
}

export function createPgDb(options: PgOptions): Db {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ...(options.ssl && options.ssl !== "off" ? { ssl: { rejectUnauthorized: options.ssl === "verify" } } : {}),
    ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
  });
  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(text: string, params?: unknown[]) {
      const result = await client.query(text, params as unknown[]);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export type SslMode = "off" | "require" | "verify";

/**
 * DATABASE_SSL: "verify" checks the server certificate against the system CAs,
 * "require" encrypts without checking it (Supabase's pooler presents its own CA),
 * "off" disables TLS. Unset: off for localhost, require elsewhere.
 */
export function sslFor(connectionString: string, explicit?: string): SslMode {
  if (explicit === "verify" || explicit === "require" || explicit === "off") return explicit;
  try {
    const host = new URL(connectionString).hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(host) ? "off" : "require";
  } catch {
    return "off";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
