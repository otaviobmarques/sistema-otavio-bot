import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";

export interface JobRow {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  max_attempts: number;
}

export type JobHandler = (ctx: AppContext, payload: Record<string, unknown>) => Promise<void>;

export interface EnqueueOptions {
  /** While a job with this key is queued or running, enqueueing it again does nothing. */
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueue(q: Queryable, type: string, payload: Record<string, unknown>, options: EnqueueOptions = {}): Promise<number | null> {
  const { rows } = await q.query<{ id: number }>(
    `INSERT INTO jobs (type, payload, run_at, max_attempts, dedupe_key) VALUES ($1, $2, COALESCE($3, now()), $4, $5)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
     RETURNING id`,
    [type, JSON.stringify(payload), options.runAt ?? null, options.maxAttempts ?? 8, options.dedupeKey ?? null],
  );
  return rows[0]?.id ?? null;
}

/** A job left running this long (its worker died with the serverless function) is taken again. */
export const STALE_LOCK_MS = 5 * 60_000;

/**
 * Takes up to `limit` due jobs. FOR UPDATE SKIP LOCKED lets several cron runs or
 * webhook requests work the queue at once without taking the same job twice.
 */
export async function claimJobs(q: Queryable, now: Date, limit: number, onlyIds?: number[]): Promise<JobRow[]> {
  const { rows } = await q.query<JobRow>(
    `UPDATE jobs SET status = 'running', locked_at = $1, attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs
       WHERE ((status = 'queued' AND run_at <= $1) OR (status = 'running' AND locked_at < $2))
         AND ($4::bigint[] IS NULL OR id = ANY ($4::bigint[]))
       ORDER BY run_at, id
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, type, payload, status, attempts, max_attempts`,
    [now, new Date(now.getTime() - STALE_LOCK_MS), limit, onlyIds ?? null],
  );
  return rows;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** (attempts - 1), 6 * 60 * 60_000);
}

export interface RunSummary {
  done: number;
  retried: number;
  failed: number;
}

export async function runJobs(
  ctx: AppContext,
  handlers: Record<string, JobHandler>,
  options: { limit?: number; onlyIds?: number[] } = {},
): Promise<RunSummary> {
  const summary: RunSummary = { done: 0, retried: 0, failed: 0 };
  const jobs = await claimJobs(ctx.db, ctx.now(), options.limit ?? 25, options.onlyIds);
  for (const job of jobs) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`nenhum processador para o tipo de tarefa ${job.type}`);
      await handler(ctx, job.payload);
      await ctx.db.query("UPDATE jobs SET status = 'done', finished_at = $2, locked_at = NULL, last_error = NULL WHERE id = $1", [job.id, ctx.now()]);
      summary.done++;
    } catch (error) {
      const message = (error as Error).message?.slice(0, 2000) ?? String(error);
      if (job.attempts >= job.max_attempts) {
        await ctx.db.query("UPDATE jobs SET status = 'failed', finished_at = $2, locked_at = NULL, last_error = $3 WHERE id = $1", [job.id, ctx.now(), message]);
        summary.failed++;
      } else {
        await ctx.db.query("UPDATE jobs SET status = 'queued', run_at = $2, locked_at = NULL, last_error = $3 WHERE id = $1",
          [job.id, new Date(ctx.now().getTime() + retryDelayMs(job.attempts)), message]);
        summary.retried++;
      }
    }
  }
  return summary;
}
