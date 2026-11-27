// E-mails to the operators when a node stops answering (and again when it is back), and when an instance stays broken.
// Each episode is mailed once: the mark (nodes.down_alerted_at, instances.unhealthy_alerted_at) is set in the same
// statement that finds it, so two cron runs never mail twice. Recipients: ADMIN_ALERT_EMAIL, or else every active owner.
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { enqueue } from "../jobs/queue.ts";

/** An active node whose agent has not reported for this long is down (its poll is every 15 s). */
export const NODE_DOWN_MS = 5 * 60_000;
/** An instance seen in error, or failing its health check, for this long is broken. */
export const INSTANCE_BROKEN_MS = 10 * 60_000;
export const ALERT_MAIL_JOB = "alert.mail";

export interface AlertMail {
  subject: string;
  text: string;
}

async function queueAlert(q: Queryable, key: string, mail: AlertMail, now: Date): Promise<void> {
  await enqueue(q, ALERT_MAIL_JOB, { subject: mail.subject, text: mail.text }, { dedupeKey: `${ALERT_MAIL_JOB}:${key}`, maxAttempts: 6, runAt: now });
}

/** ADMIN_ALERT_EMAIL (one or more, comma-separated), or every active owner of the panel. */
export async function alertRecipients(ctx: AppContext): Promise<string[]> {
  if (ctx.config.alertEmails?.length) return ctx.config.alertEmails;
  const { rows } = await ctx.db.query<{ email: string }>("SELECT email FROM admins WHERE role = 'owner' AND status = 'active' ORDER BY created_at");
  return rows.map((row) => row.email);
}

/** The job behind each alert: the same text to every recipient. */
export async function sendAlertMail(ctx: AppContext, mail: AlertMail): Promise<number> {
  const recipients = await alertRecipients(ctx);
  if (!recipients.length) console.warn(`[avisos] ninguém para avisar (defina ADMIN_ALERT_EMAIL): ${mail.subject}`);
  for (const to of recipients) await ctx.mailer.send({ to, subject: mail.subject, text: mail.text });
  return recipients.length;
}

const brasilia = (value: Date | string | null) => value
  ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca";

export interface AlertSweep {
  nodesDown: number;
  nodesBack: number;
  instancesBroken: number;
  instancesBack: number;
}

/** One pass: finds new episodes and ended ones, marks them and queues their e-mails. Run by the cron tick. */
export async function checkHealthAlerts(ctx: AppContext): Promise<AlertSweep> {
  const now = ctx.now();
  const panel = `${ctx.config.publicUrl}/instancias`;
  const downBefore = new Date(now.getTime() - NODE_DOWN_MS);
  const sweep: AlertSweep = { nodesDown: 0, nodesBack: 0, instancesBroken: 0, instancesBack: 0 };
  const alert = (q: Queryable, key: string, mail: AlertMail) => queueAlert(q, key, mail, now);
  await ctx.db.tx(async (q) => {
    // A node taken out of service (draining, offline) is not an incident: its mark goes quietly.
    await q.query("UPDATE nodes SET down_alerted_at = NULL WHERE down_alerted_at IS NOT NULL AND status <> 'active'");
    const down = await q.query<{ id: string; name: string; last_seen_at: Date; public_ip: string | null; instances: number }>(
      `UPDATE nodes n SET down_alerted_at = $1
       WHERE n.status = 'active' AND n.agent_token_hash IS NOT NULL AND n.last_seen_at IS NOT NULL AND n.last_seen_at < $2 AND n.down_alerted_at IS NULL
       RETURNING n.id, n.name, n.last_seen_at, n.public_ip,
         (SELECT count(*)::int FROM instances i WHERE i.node_id = n.id AND i.decommissioned_at IS NULL) AS instances`, [now, downBefore]);
    for (const node of down.rows) {
      await alert(q, `node-down:${node.id}:${now.getTime()}`, {
        subject: `[ArkoBot] Servidor ${node.name} sem contato`,
        text: [
          `O agente do servidor ${node.name}${node.public_ip ? ` (${node.public_ip})` : ""} não fala com o Admin desde ${brasilia(node.last_seen_at)} (horário de Brasília).`,
          "",
          `${node.instances} instância(s) de clientes estão nele. Elas continuam rodando se só o agente caiu; se o servidor inteiro caiu, estão fora do ar.`,
          "",
          "O que olhar: a VPS está ligada? O contêiner arkobot-node-agent está rodando (docker ps)? O token do agente foi trocado?",
          "Você recebe outro e-mail quando ele voltar.",
          "",
          panel,
        ].join("\n"),
      });
    }
    const back = await q.query<{ id: string; name: string; down_alerted_at: Date }>(
      `WITH old AS (SELECT id, down_alerted_at FROM nodes WHERE down_alerted_at IS NOT NULL AND last_seen_at >= $1 FOR UPDATE)
       UPDATE nodes n SET down_alerted_at = NULL FROM old WHERE n.id = old.id RETURNING n.id, n.name, old.down_alerted_at`, [downBefore]);
    for (const node of back.rows) {
      await alert(q, `node-back:${node.id}:${now.getTime()}`, {
        subject: `[ArkoBot] Servidor ${node.name} voltou`,
        text: `O agente do servidor ${node.name} voltou a falar com o Admin em ${brasilia(now)} (o aviso de queda foi às ${brasilia(node.down_alerted_at)}).\n\n${panel}`,
      });
    }

    // Instances: only on a node that answers (a down node already got its own e-mail, and its reports are old).
    const broken = await q.query<{ id: string; slug: string; observed_state: string | null; observed_health: string | null; observed_error: string | null; unhealthy_since: Date; node_name: string }>(
      `UPDATE instances i SET unhealthy_alerted_at = $1 FROM nodes n
       WHERE n.id = i.node_id AND n.last_seen_at >= $3 AND i.decommissioned_at IS NULL AND i.unhealthy_alerted_at IS NULL AND i.unhealthy_since < $2
       RETURNING i.id, i.slug, i.observed_state, i.observed_health, i.observed_error, i.unhealthy_since, n.name AS node_name`,
      [now, new Date(now.getTime() - INSTANCE_BROKEN_MS), downBefore]);
    for (const instance of broken.rows) {
      const what = instance.observed_state === "error" ? "com erro no Docker" : "falhando no health check";
      await alert(q, `instance-broken:${instance.id}:${now.getTime()}`, {
        subject: `[ArkoBot] Instância ${instance.slug} ${what}`,
        text: [
          `A instância ${instance.slug} (servidor ${instance.node_name}) está ${what} desde ${brasilia(instance.unhealthy_since)} (horário de Brasília).`,
          ...(instance.observed_error ? ["", `Último erro: ${instance.observed_error.slice(0, 500)}`] : []),
          "",
          "O que tentar: Reprovisionar na página Instâncias (os dados ficam no volume), ou olhar os logs do contêiner na VPS.",
          "",
          panel,
        ].join("\n"),
      });
    }
    const healed = await q.query<{ id: string; slug: string; decommissioned_at: Date | null }>(
      `UPDATE instances SET unhealthy_alerted_at = NULL WHERE unhealthy_alerted_at IS NOT NULL AND (unhealthy_since IS NULL OR decommissioned_at IS NOT NULL)
       RETURNING id, slug, decommissioned_at`);
    for (const instance of healed.rows) {
      if (instance.decommissioned_at) continue;
      await alert(q, `instance-back:${instance.id}:${now.getTime()}`, {
        subject: `[ArkoBot] Instância ${instance.slug} voltou ao normal`,
        text: `O agente não vê mais erro na instância ${instance.slug} (${brasilia(now)}).\n\n${panel}`,
      });
    }
    sweep.nodesDown = down.rows.length;
    sweep.nodesBack = back.rows.length;
    sweep.instancesBroken = broken.rows.length;
    sweep.instancesBack = healed.rows.filter((row) => !row.decommissioned_at).length;
  });
  return sweep;
}
