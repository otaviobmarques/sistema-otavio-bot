import { Coins, Gauge, Percent, Receipt } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useApi } from "../api.ts";
import { brl, dateTime, int } from "../format.ts";
import { Badge, Card, ErrorNote, Loading, PageHeader, Select, Stat, Table, Tabs, td } from "../ui.tsx";

interface Totals {
  requests: number; ok: number; refused: number; errors: number; input_tokens: number; output_tokens: number;
  cost_usd_micros: number; cost_brl_cents: number; credits: number;
}
type Row = Totals & { organization_id?: string; organization_name?: string; company?: string; bot?: string; provider?: string; model?: string };

interface UsageData {
  days: number;
  summary: Totals;
  byClient: Row[];
  byCompany: Row[];
  byBot: Row[];
  byModel: Row[];
  refusals: { error_code: string | null; n: number }[];
  daily: { day: string; credits: number; cost_brl_cents: number }[];
  recent: {
    id: number; created_at: string; provider: string; model: string; status: string; error_code: string | null; company: string | null; bot: string | null;
    input_tokens: number; output_tokens: number; cache_read_tokens: number; credits: number; cost_brl_cents: number; usage_estimated: boolean;
    organization_id: string; organization_name: string;
  }[];
}

type View = "clients" | "companies" | "bots" | "models" | "recent";

const REFUSAL: Record<string, string> = {
  credits_used_up: "Créditos esgotados",
  plan_suspended: "Plano suspenso",
  daily_cap_reached: "Teto diário",
  monthly_cap_reached: "Teto mensal",
  request_over_plan_limit: "Acima do teto por requisição",
  model_not_in_plan: "Modelo fora do plano",
  model_unavailable: "Modelo indisponível",
  upstream_unavailable: "Provedor fora do ar",
};
const refusalLabel = (code: string | null) => (code ? REFUSAL[code] ?? (code.startsWith("upstream_") ? `Erro do provedor (${code.slice(9)})` : code) : "—");

const margin = (row: Totals) => Number(row.credits) - Number(row.cost_brl_cents);
const marginPct = (row: Totals) => (Number(row.credits) > 0 ? Math.round((margin(row) / Number(row.credits)) * 100) : null);

function MarginCell({ row }: { row: Totals }) {
  const value = margin(row);
  const pct = marginPct(row);
  return <span className={value < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>{brl(value)}{pct !== null ? <span className="ml-1 text-xs font-normal text-slate-500">({pct}%)</span> : null}</span>;
}

const money = (row: Totals) => [
  <span className="tabular">{int(row.requests)}{Number(row.refused) + Number(row.errors) > 0 ? <span className="block text-xs text-slate-500">{int(Number(row.refused) + Number(row.errors))} recusadas/erro</span> : null}</span>,
  <span className="tabular text-slate-600">{int(Number(row.input_tokens) + Number(row.output_tokens))}</span>,
  <span className="tabular">{brl(row.cost_brl_cents)}</span>,
  <span className="tabular">{int(row.credits)} <span className="text-xs text-slate-500">= {brl(row.credits)}</span></span>,
  <MarginCell row={row} />,
];
const MONEY_HEAD = ["Requisições", "Tokens", "Custo Domma", "Créditos cobrados", "Margem"];

export function UsagePage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>("clients");
  const days = params.get("dias") ?? "30";
  const organization = params.get("cliente");
  const { data, error, loading } = useApi<UsageData>(`/api/gateway/usage?days=${days}${organization ? `&organization=${organization}` : ""}`);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const s = data.summary;
  const maxDay = Math.max(1, ...data.daily.map((d) => Number(d.credits)));
  const clientName = organization ? data.byClient[0]?.organization_name : null;

  return (
    <>
      <PageHeader
        title="Consumo de IA"
        subtitle={<>Uso que passa pelo gateway ArkoBot (a IA paga pela Domma). Uso com a conta ou chave do próprio cliente não aparece aqui.{clientName ? <> Filtrado: <b>{clientName}</b> · <Link to="/consumo" className="text-cyan-ink hover:underline">ver todos</Link></> : null}</>}
        actions={<Select value={days} onChange={(e) => { params.set("dias", e.target.value); setParams(params); }} className="w-44">
          <option value="1">Últimas 24 horas</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option>
        </Select>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Requisições" value={int(s.requests)} icon={<Gauge className="h-4 w-4" />} hint={`${int(s.ok)} cobradas · ${int(s.refused)} recusadas · ${int(s.errors)} com erro`} />
        <Stat label="Custo real (Domma)" value={brl(s.cost_brl_cents)} icon={<Receipt className="h-4 w-4" />} hint={`US$ ${(Number(s.cost_usd_micros) / 1e6).toFixed(2)} nos provedores`} />
        <Stat label="Créditos cobrados" value={int(s.credits)} icon={<Coins className="h-4 w-4" />} hint={`= ${brl(s.credits)} (1 crédito = R$ 0,01)`} />
        <Stat label="Margem" value={brl(margin(s))} icon={<Percent className="h-4 w-4" />} tone={margin(s) < 0 ? "alert" : "default"}
          hint={marginPct(s) !== null ? `${marginPct(s)}% do que foi cobrado` : "Sem cobrança no período"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Créditos cobrados por dia" className="xl:col-span-2">
          {data.daily.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Sem consumo no período.</p> : (
            <div className="flex h-40 items-end gap-1">
              {data.daily.map((d) => (
                <div key={d.day} className="group relative flex-1" title={`${d.day.split("-").reverse().join("/")}: ${int(d.credits)} créditos · custo ${brl(d.cost_brl_cents)}`}>
                  <div className="rounded-t bg-cyan-ink/80 group-hover:bg-cyan-ink" style={{ height: `${Math.max(2, (Number(d.credits) / maxDay) * 150)}px` }} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Recusas e erros" padded={false}>
          <ul className="divide-y divide-line">
            {data.refusals.length === 0 ? <li className="px-5 py-8 text-center text-sm text-slate-500">Nenhuma recusa no período.</li> : null}
            {data.refusals.map((row) => (
              <li key={row.error_code ?? "?"} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>{refusalLabel(row.error_code)}</span><span className="font-semibold tabular">{int(row.n)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6">
        <Tabs<View> value={view} onChange={setView} items={[
          { value: "clients", label: "Por cliente", count: data.byClient.length },
          { value: "companies", label: "Por empresa", count: data.byCompany.length },
          { value: "bots", label: "Por bot", count: data.byBot.length },
          { value: "models", label: "Por modelo", count: data.byModel.length },
          { value: "recent", label: "Últimas requisições" },
        ]} />
        <Card padded={false}>
          {view === "clients" ? (
            <Table head={["Cliente", ...MONEY_HEAD]} empty="Sem consumo no período.">
              {data.byClient.map((row) => (
                <tr key={row.organization_id} className="hover:bg-slate-50">
                  <td className={td}><Link to={`/clientes/${row.organization_id}`} className="font-medium hover:text-cyan-ink">{row.organization_name}</Link></td>
                  {money(row).map((cell, i) => <td key={i} className={td}>{cell}</td>)}
                </tr>
              ))}
            </Table>
          ) : view === "companies" ? (
            <Table head={["Cliente", "Empresa", ...MONEY_HEAD]} empty="Sem consumo no período.">
              {data.byCompany.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className={td}><Link to={`/clientes/${row.organization_id}`} className="font-medium hover:text-cyan-ink">{row.organization_name}</Link></td>
                  <td className={td}>{row.company || <span className="text-slate-400">sem empresa</span>}</td>
                  {money(row).map((cell, j) => <td key={j} className={td}>{cell}</td>)}
                </tr>
              ))}
            </Table>
          ) : view === "bots" ? (
            <Table head={["Cliente", "Empresa", "Bot", ...MONEY_HEAD]} empty="Sem consumo no período.">
              {data.byBot.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className={td}><Link to={`/clientes/${row.organization_id}`} className="font-medium hover:text-cyan-ink">{row.organization_name}</Link></td>
                  <td className={td}>{row.company || <span className="text-slate-400">—</span>}</td>
                  <td className={td}>{row.bot || <span className="text-slate-400">sem bot</span>}</td>
                  {money(row).map((cell, j) => <td key={j} className={td}>{cell}</td>)}
                </tr>
              ))}
            </Table>
          ) : view === "models" ? (
            <Table head={["Modelo", "Provedor", ...MONEY_HEAD]} empty="Sem consumo no período.">
              {data.byModel.map((row) => (
                <tr key={`${row.provider}/${row.model}`} className="hover:bg-slate-50">
                  <td className={`${td} font-medium`}>{row.model}</td>
                  <td className={td}><Badge tone="slate">{row.provider}</Badge></td>
                  {money(row).map((cell, j) => <td key={j} className={td}>{cell}</td>)}
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={["Quando", "Cliente", "Empresa · bot", "Modelo", "Tokens (entrada / cache / saída)", "Custo", "Créditos", "Situação"]} empty="Sem requisições no período.">
              {data.recent.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.created_at)}</td>
                  <td className={td}><Link to={`/clientes/${row.organization_id}`} className="hover:text-cyan-ink">{row.organization_name}</Link></td>
                  <td className={`${td} text-slate-600`}>{[row.company, row.bot].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={td}>{row.model}</td>
                  <td className={`${td} tabular text-slate-600`}>{int(row.input_tokens)} / {int(row.cache_read_tokens)} / {int(row.output_tokens)}</td>
                  <td className={`${td} tabular`}>{brl(row.cost_brl_cents)}</td>
                  <td className={`${td} tabular font-semibold`}>{int(row.credits)}{row.usage_estimated ? <span className="ml-1 text-xs font-normal text-amber-700" title="O pedido parou antes do provedor informar o uso; a saída foi estimada">est.</span> : null}</td>
                  <td className={td}>{row.status === "ok" ? <Badge tone="green">cobrada</Badge> : <Badge tone={row.status === "refused" ? "amber" : "red"}>{refusalLabel(row.error_code)}</Badge>}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
