import { AlertTriangle, Building2, Coins, Gauge, Inbox, TrendingUp, Wallet } from "lucide-react";
import { Link } from "react-router";
import { useApi } from "../api.ts";
import { actionLabel, ACTOR, brl, date, dateTime, daysSince, int, PAYMENT_STATUS, SUB_STATUS } from "../format.ts";
import { Badge, Card, ErrorNote, Loading, PageHeader, Stat, StatusBadge, Table, td } from "../ui.tsx";

interface Overview {
  stats: Record<string, number>;
  recentPayments: { id: string; status: string; kind: string; value_cents: number; billing_type: string | null; paid_at: string | null; due_date: string | null; created_at: string; organization_id: string; organization_name: string }[];
  delinquent: { id: string; status: string; past_due_since: string | null; organization_id: string; organization_name: string; plan_name: string; value_cents: number }[];
  recentAudit: { id: number; created_at: string; actor_type: string; actor_label: string | null; action: string; reason: string | null; organization_id: string | null; organization_name: string | null }[];
}

const plural = (n: number | undefined, one: string, many: string) => `${int(n)} ${Number(n) === 1 ? one : many}`;

export function OverviewPage() {
  const { data, error, loading } = useApi<Overview>("/api/overview");
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const s = data.stats;
  const delinquent = Number(s.past_due) + Number(s.suspended_billing);
  return (
    <>
      <PageHeader title="Visão geral" subtitle="Números do banco do Admin, em tempo real." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clientes ativos" value={int(s.active_clients)} icon={<Building2 className="h-4 w-4" />}
          hint={`${plural(s.paying, "pagante", "pagantes")} · ${plural(s.suspended_clients, "suspenso", "suspensos")}`} />
        <Stat label="MRR" value={brl(s.mrr_cents)} icon={<TrendingUp className="h-4 w-4" />} hint={`Recebido no mês: ${brl(s.received_month_cents)}`} />
        <Stat label="Margem de IA (mês)" value={brl(Number(s.ai_credits_month) - Number(s.ai_cost_brl_cents_month))} icon={<Gauge className="h-4 w-4" />}
          tone={Number(s.ai_credits_month) - Number(s.ai_cost_brl_cents_month) < 0 ? "alert" : "default"}
          hint={<Link to="/consumo" className="text-cyan-ink hover:underline">Cobrado {brl(s.ai_credits_month)} · custo {brl(s.ai_cost_brl_cents_month)}</Link>} />
        <Stat label="Inadimplentes" value={int(delinquent)} icon={<AlertTriangle className="h-4 w-4" />} tone={delinquent > 0 ? "alert" : "default"}
          hint={`${int(s.past_due)} em atraso · ${plural(s.suspended_billing, "suspenso", "suspensos")} por cobrança`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Créditos consumidos (mês)" value={int(s.credits_used_month)} icon={<Coins className="h-4 w-4" />}
          hint={`= ${brl(s.credits_used_month)} · ${int(s.credits_granted_month)} creditados no mês`} />
        <Stat label="Eventos do Asaas na fila" value={int(s.events_waiting)} icon={<Inbox className="h-4 w-4" />} hint="Processados a cada webhook e no cron" />
        <Stat label="Tarefas com falha" value={int(s.jobs_failed)} icon={<Wallet className="h-4 w-4" />} tone={Number(s.jobs_failed) > 0 ? "alert" : "default"}
          hint={<Link to="/cobranca?aba=eventos" className="text-cyan-ink hover:underline">Ver eventos e tarefas</Link>} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Precisam de atenção" actions={<Link to="/cobranca?aba=inadimplentes" className="text-xs font-medium text-cyan-ink hover:underline">Ver todos</Link>} padded={false}>
          <Table head={["Cliente", "Plano", "Situação", "Desde"]} empty="Nenhum cliente em atraso.">
            {data.delinquent.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className={td}><Link to={`/clientes/${row.organization_id}`} className="font-medium hover:text-cyan-ink">{row.organization_name}</Link></td>
                <td className={td}>{row.plan_name} <span className="text-slate-500">· {brl(row.value_cents)}</span></td>
                <td className={td}><StatusBadge map={SUB_STATUS} value={row.status} /></td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{row.past_due_since ? `${daysSince(row.past_due_since)} dias` : "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Últimos pagamentos" actions={<Link to="/cobranca?aba=pagamentos" className="text-xs font-medium text-cyan-ink hover:underline">Ver todos</Link>} padded={false}>
          <Table head={["Cliente", "Valor", "Status", "Data"]} empty="Nenhum pagamento ainda.">
            {data.recentPayments.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className={td}>
                  <Link to={`/clientes/${row.organization_id}`} className="font-medium hover:text-cyan-ink">{row.organization_name}</Link>
                  {row.kind === "credit_purchase" ? <span className="ml-2"><Badge tone="cyan">créditos</Badge></span> : null}
                </td>
                <td className={`${td} tabular`}>{brl(row.value_cents)}</td>
                <td className={td}><StatusBadge map={PAYMENT_STATUS} value={row.status} /></td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{row.paid_at ? date(row.paid_at) : date(row.due_date)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title="Atividade recente" className="mt-6" actions={<Link to="/auditoria" className="text-xs font-medium text-cyan-ink hover:underline">Auditoria completa</Link>} padded={false}>
        <ul className="divide-y divide-line">
          {data.recentAudit.length === 0 ? <li className="px-5 py-8 text-center text-sm text-slate-500">Nada registrado ainda.</li> : null}
          {data.recentAudit.map((row) => (
            <li key={row.id} className="flex items-center gap-4 px-5 py-3 text-sm">
              <span className="w-36 shrink-0 text-xs text-slate-500">{dateTime(row.created_at)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{actionLabel(row.action)}</span>
                {row.organization_name ? <> · <Link to={`/clientes/${row.organization_id}`} className="text-cyan-ink hover:underline">{row.organization_name}</Link></> : null}
                {row.reason ? <span className="text-slate-500"> — {row.reason}</span> : null}
              </span>
              <span className="text-xs text-slate-500">{row.actor_label ?? ACTOR[row.actor_type]}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
