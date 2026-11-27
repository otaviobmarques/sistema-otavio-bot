import { endScheduledCancellations } from "../billing/cancel-at-period-end.ts";
import { renewCourtesies, type CourtesySummary } from "../billing/courtesy.ts";
import { CANCEL_PROVIDER_SUBSCRIPTION_JOB, cancelProviderSubscriptionJob, runDunning, type DunningSummary } from "../billing/service.ts";
import { markBillingEventFailed, PROCESS_EVENT_JOB, processBillingEvent } from "../billing/webhooks.ts";
import { sweepRateLimits } from "../auth/rate-limit.ts";
import type { AppContext } from "../context.ts";
import { expireReservations } from "../gateway/accounting.ts";
import { provisionForOrganization, sweepProvisioning, syncInstancePlan, type ProvisioningSweep } from "../provisioning/instances.ts";
import { PROVISION_INSTANCE_JOB, STORAGE_MAIL_JOB, SYNC_INSTANCE_PLAN_JOB, SYNC_INSTANCE_STORAGE_JOB } from "../provisioning/queue.ts";
import { sendStorageMail, syncInstanceStorage } from "../provisioning/storage.ts";
import { ALERT_MAIL_JOB, checkHealthAlerts, sendAlertMail, type AlertSweep } from "../provisioning/health-alerts.ts";
import { checkIdleInstances, wakeDueInstances, type IdleSweep } from "../provisioning/sleep.ts";
import { SYSTEM } from "../audit.ts";
import { sweepComputers, syncOrganizationComputers, type SyncResult } from "../computers/machines.ts";
import { advanceDueMachines, advanceMachine } from "../computers/provisioning.ts";
import { ADVANCE_COMPUTER_JOB, SYNC_COMPUTERS_JOB } from "../computers/queue.ts";
import { runJobs, type JobHandler, type RunSummary } from "./queue.ts";

export const JOB_HANDLERS: Record<string, JobHandler> = {
  [PROCESS_EVENT_JOB]: async (ctx, payload) => {
    const id = String(payload.billingEventId);
    try {
      await processBillingEvent(ctx, id);
    } catch (error) {
      await markBillingEventFailed(ctx, id, (error as Error).message);
      throw error;
    }
  },
  [CANCEL_PROVIDER_SUBSCRIPTION_JOB]: cancelProviderSubscriptionJob,
  [PROVISION_INSTANCE_JOB]: async (ctx, payload) => {
    await provisionForOrganization(ctx, SYSTEM, String(payload.organizationId));
  },
  [SYNC_INSTANCE_PLAN_JOB]: async (ctx, payload) => {
    await syncInstancePlan(ctx, String(payload.instanceId));
  },
  [STORAGE_MAIL_JOB]: async (ctx, payload) => {
    await sendStorageMail(ctx, String(payload.instanceId), payload.level === 100 ? 100 : 80);
  },
  [SYNC_INSTANCE_STORAGE_JOB]: async (ctx, payload) => {
    await syncInstanceStorage(ctx, String(payload.instanceId));
  },
  [SYNC_COMPUTERS_JOB]: async (ctx, payload) => {
    await syncOrganizationComputers(ctx, String(payload.organizationId));
  },
  [ADVANCE_COMPUTER_JOB]: async (ctx, payload) => {
    await advanceMachine(ctx, String(payload.machineId));
  },
  [ALERT_MAIL_JOB]: async (ctx, payload) => {
    await sendAlertMail(ctx, { subject: String(payload.subject), text: String(payload.text) });
  },
};

export interface TickSummary {
  jobs: RunSummary;
  dunning: DunningSummary;
  courtesy: CourtesySummary;
  scheduledCancellations: number;
  expiredReservations: number;
  provisioning: ProvisioningSweep;
  computers: SyncResult & { advanced: number };
  /** Instances of plans that sleep: woken for their next routine, and the awake ones asked whether they are idle. */
  sleep: IdleSweep & { woken: number };
  alerts: AlertSweep;
}

/** One cron tick: the overdue ladder, the courtesies and the cancellations due at the end of a paid period, then the queue. Safe to run concurrently and as often as wanted. */
export async function tick(ctx: AppContext, limit = 50): Promise<TickSummary> {
  const dunning = await runDunning(ctx);
  const courtesy = await renewCourtesies(ctx);
  const scheduledCancellations = await endScheduledCancellations(ctx);
  // Before the queue, so an alert's e-mail goes out on this same tick.
  const alerts = await checkHealthAlerts(ctx);
  const jobs = await runJobs(ctx, JOB_HANDLERS, { limit });
  const provisioning = await sweepProvisioning(ctx);
  const computers = { ...(await sweepComputers(ctx)), advanced: await advanceDueMachines(ctx) };
  const woken = await wakeDueInstances(ctx, { poke: true });
  const idle = await checkIdleInstances(ctx);
  await sweepRateLimits(ctx.db, ctx.now());
  const expiredReservations = await expireReservations(ctx.db, ctx.now());
  const weekAgo = new Date(ctx.now().getTime() - 7 * 24 * 60 * 60_000);
  await ctx.db.query("DELETE FROM admin_sessions WHERE expires_at < $1", [weekAgo]);
  await ctx.db.query("DELETE FROM account_sessions WHERE expires_at < $1", [weekAgo]);
  await ctx.db.query("DELETE FROM account_otps WHERE expires_at < $1", [ctx.now()]);
  return { jobs, dunning, courtesy, scheduledCancellations, expiredReservations, provisioning, computers, sleep: { ...idle, woken }, alerts };
}
