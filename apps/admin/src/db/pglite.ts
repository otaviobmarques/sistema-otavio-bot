import { PGlite, types, type Transaction } from "@electric-sql/pglite";
import type { Db, Queryable } from "./db.ts";

type Runner = Pick<PGlite, "query" | "exec"> | Transaction;

function wrap(runner: Runner): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      if (params === undefined || params.length === 0) {
        const results = await runner.exec(text);
        const last = results[results.length - 1];
        return { rows: (last?.rows ?? []) as T[], rowCount: last?.affectedRows ?? last?.rows.length ?? 0 };
      }
      const result = await runner.query<T>(text, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  };
}

/** Postgres compiled to WebAssembly, in memory: the test suite's default database (and a no-install dev option). */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pglite = await PGlite.create(dataDir, { parsers: { [types.INT8]: (value: string) => Number(value), [types.DATE]: (value: string) => value } });
  let chain: Promise<unknown> = Promise.resolve();
  return {
    ...wrap(pglite),
    tx(fn) {
      // PGlite has one connection; transactions queue instead of interleaving.
      const run = chain.then(() => pglite.transaction((tx) => fn(wrap(tx))));
      chain = run.catch(() => undefined);
      return run;
    },
    close: () => pglite.close(),
  };
}
