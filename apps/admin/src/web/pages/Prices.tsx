import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "../api.ts";
import { canWrite, useMe } from "../App.tsx";
import { brl, dateTime } from "../format.ts";
import { Badge, Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Table, td, useToast } from "../ui.tsx";

interface PriceRow {
  model: string; provider: string; label: string; free: boolean; upstream_model: string | null; input_usd: string; cached_input_usd: string; cache_write_usd: string;
  output_usd: string; markup_percent: string | null; default_max_output: number; enabled: boolean; source: string; updated_at: string; updated_by_email: string | null;
}
interface Settings { markup_percent: string; usd_brl_rate: string; overdraft_credits: number; rate_limit_per_minute: number; reservation_minutes: number; updated_at: string }
interface PricesData { prices: PriceRow[]; settings: Settings; plans: { code: string; name: string; allowed_models: string[]; free_requests_per_day: number }[] }

const PROVIDER: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter", google: "Google AI Studio", nvidia: "NVIDIA", groq: "Groq", cerebras: "Cerebras" };
const decimal = (value: string) => Number(value.replace(",", "."));
const usd = (value: string | number) => `US$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** Credits for one million output tokens, as the gateway charges them. */
function creditsPerMillion(usdPerMillion: number, settings: Settings, markup: string | null): number {
  return Math.ceil(usdPerMillion * Number(settings.usd_brl_rate) * 100 * (1 + Number(markup ?? settings.markup_percent) / 100));
}

export function PricesPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<PricesData>("/api/gateway/prices");
  const [editing, setEditing] = useState<PriceRow | "new" | null>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const writable = canWrite(me);
  const plansFor = (row: PriceRow) => data.plans.filter((plan) => (!row.free || plan.free_requests_per_day > 0) && (plan.allowed_models.length === 0 || plan.allowed_models.includes(row.model)));
  return (
    <>
      <PageHeader title="Tabela de preços" subtitle="Preço de lista de cada modelo nos provedores (US$ por milhão de tokens), câmbio e markup que viram créditos ArkoBot no gateway."
        actions={writable ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Adicionar modelo</Button> : null} />
      <SettingsCard settings={data.settings} writable={writable} onSaved={reload} />
      <Card title="Modelos" className="mt-6" padded={false}>
        <Table head={["Modelo", "Provedor", "Entrada / saída", "Cache (leit. / escr.)", "Markup", "1M de saída", "Planos"]}>
          {data.prices.map((row) => (
            <tr key={row.model} className={row.enabled ? "hover:bg-slate-50" : "bg-slate-50/60 text-slate-400"}>
              <td className={td}>
                <div className="flex items-center gap-1.5 whitespace-nowrap font-medium text-ink">{row.label || row.model}
                  {writable ? <button type="button" aria-label="Editar" title={`Editar ${row.model}`} onClick={() => setEditing(row)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-cyan-ink"><Pencil className="h-3.5 w-3.5" /></button> : null}
                </div>
                <div className="whitespace-nowrap font-mono text-xs text-slate-500">{row.model}{row.upstream_model ? ` → ${row.upstream_model}` : ""}</div>
              </td>
              <td className={td}><Badge tone={row.provider === "anthropic" ? "violet" : row.provider === "openai" ? "green" : "cyan"}>{PROVIDER[row.provider] ?? row.provider}</Badge>{row.free ? <> <Badge tone="green">grátis</Badge></> : null}</td>
              <td className={`${td} whitespace-nowrap tabular`}>{usd(row.input_usd)} / {usd(row.output_usd)}</td>
              <td className={`${td} whitespace-nowrap tabular text-slate-600`}>{usd(row.cached_input_usd)} / {usd(row.cache_write_usd)}</td>
              <td className={`${td} whitespace-nowrap tabular`}>{row.markup_percent === null ? <span className="text-slate-500">{Number(data.settings.markup_percent)}% (geral)</span> : <b>{Number(row.markup_percent)}%</b>}</td>
              <td className={`${td} whitespace-nowrap tabular`}>
                {creditsPerMillion(Number(row.output_usd), data.settings, row.markup_percent).toLocaleString("pt-BR")} cr.
                <div className="text-xs text-slate-500">custo {brl(Number(row.output_usd) * Number(data.settings.usd_brl_rate) * 100)}</div>
              </td>
              <td className={td}>
                <div className="max-w-40 text-xs text-slate-600">{row.enabled ? plansFor(row).map((plan) => plan.name).join(", ") || "—" : <Badge>desativado</Badge>}</div>
              </td>
            </tr>
          ))}
        </Table>
        <p className="border-t border-line px-5 py-3 text-xs text-slate-500">
          O gateway cobra: tokens × preço (ou o custo informado pelo OpenRouter) × câmbio × (1 + markup), arredondado para cima em créditos (1 crédito = R$ 0,01).
          Para liberar um modelo a um cliente, inclua o id dele nos modelos permitidos do plano.
        </p>
      </Card>
      {editing ? <PriceEditor price={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </>
  );
}

function SettingsCard({ settings, writable, onSaved }: { settings: Settings; writable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const initial = () => ({
    markup: String(Number(settings.markup_percent)).replace(".", ","), rate: String(Number(settings.usd_brl_rate)).replace(".", ","),
    overdraft: String(settings.overdraft_credits), rateLimit: String(settings.rate_limit_per_minute), reservation: String(settings.reservation_minutes),
  });
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof f) => (event: { target: { value: string } }) => setF({ ...f, [key]: event.target.value });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/gateway/settings", { method: "PUT", body: {
        markupPercent: decimal(f.markup), usdBrlRate: decimal(f.rate), overdraftCredits: Number(f.overdraft), rateLimitPerMinute: Number(f.rateLimit), reservationMinutes: Number(f.reservation),
      } });
      toast("Configurações do gateway salvas");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Conversão e limites gerais" actions={<span className="text-xs text-slate-500">Alterado em {dateTime(settings.updated_at)}</span>}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Field label="Markup geral (%)" hint="Sobre o custo real"><Input value={f.markup} onChange={set("markup")} disabled={!writable} /></Field>
        <Field label="Câmbio (R$ por US$)" hint="Converte o custo"><Input value={f.rate} onChange={set("rate")} disabled={!writable} /></Field>
        <Field label="Tolerância negativa" hint="Créditos abaixo de zero"><Input inputMode="numeric" value={f.overdraft} onChange={set("overdraft")} disabled={!writable} /></Field>
        <Field label="Requisições/min" hint="Por cliente"><Input inputMode="numeric" value={f.rateLimit} onChange={set("rateLimit")} disabled={!writable} /></Field>
        <Field label="Reserva expira (min)" hint="Pedido sem resposta"><Input inputMode="numeric" value={f.reservation} onChange={set("reservation")} disabled={!writable} /></Field>
      </div>
      <ErrorNote message={error} />
      {writable ? <div className="mt-4 flex justify-end"><Button busy={busy} onClick={save}>Salvar configurações</Button></div> : null}
    </Card>
  );
}

function PriceEditor({ price, onClose, onSaved }: { price: PriceRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const text = (value: string | null | undefined) => (value === null || value === undefined ? "" : String(Number(value)).replace(".", ","));
  const [f, setF] = useState(() => ({
    model: price?.model ?? "", provider: price?.provider ?? "anthropic", label: price?.label ?? "",
    input: text(price?.input_usd), cached: text(price?.cached_input_usd), write: text(price?.cache_write_usd), output: text(price?.output_usd),
    markup: text(price?.markup_percent), maxOutput: String(price?.default_max_output ?? 8192), enabled: price?.enabled ?? true,
    free: price?.free ?? false, upstream: price?.upstream_model ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof f) => (event: { target: { value: string } }) => setF({ ...f, [key]: event.target.value });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/gateway/prices", { method: "PUT", body: {
        model: f.model, provider: f.provider, label: f.label, inputUsd: f.free ? 0 : decimal(f.input), cachedInputUsd: f.free ? 0 : decimal(f.cached), cacheWriteUsd: f.free ? 0 : decimal(f.write),
        outputUsd: f.free ? 0 : decimal(f.output), markupPercent: f.markup.trim() ? decimal(f.markup) : null, defaultMaxOutput: Number(f.maxOutput), enabled: f.enabled,
        free: f.free, upstreamModel: f.upstream.trim() || null,
      } });
      toast("Preço salvo");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={price ? `Preço de ${price.label || price.model}` : "Adicionar modelo"} open onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Salvar</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Id do modelo" hint="Como o provedor chama"><Input value={f.model} onChange={set("model")} disabled={Boolean(price)} className="font-mono text-xs" placeholder="claude-haiku-4-5" /></Field>
        <Field label="Provedor"><Select value={f.provider} onChange={set("provider")}>{Object.entries(PROVIDER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      </div>
      <Field label="Nome exibido"><Input value={f.label} onChange={set("label")} placeholder="Claude Haiku 4.5" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Entrada (US$/1M)"><Input value={f.input} onChange={set("input")} /></Field>
        <Field label="Saída (US$/1M)"><Input value={f.output} onChange={set("output")} /></Field>
        <Field label="Cache: leitura (US$/1M)"><Input value={f.cached} onChange={set("cached")} /></Field>
        <Field label="Cache: escrita (US$/1M)"><Input value={f.write} onChange={set("write")} /></Field>
        <Field label="Markup próprio (%)" hint="Vazio = markup geral"><Input value={f.markup} onChange={set("markup")} /></Field>
        <Field label="Saída máxima estimada" hint="Tokens, quando o pedido não diz"><Input inputMode="numeric" value={f.maxOutput} onChange={set("maxOutput")} /></Field>
      </div>
      <Field label="Id no provedor (opcional)" hint="Quando o provedor chama o modelo por outro id (ex.: gemini-2.5-flash)"><Input value={f.upstream} onChange={set("upstream")} className="font-mono text-xs" /></Field>
      <Checkbox label="Ativo no gateway" checked={f.enabled} onChange={(enabled) => setF({ ...f, enabled })} hint="Desativado, ninguém usa este modelo pelo gateway" />
      <Checkbox label="Grátis (plano gratuito do provedor)" checked={f.free} onChange={(free) => setF({ ...free ? { ...f, input: "0", cached: "0", write: "0", output: "0" } : f, free })}
        hint="Custa 0 crédito e conta no limite diário de IA gratuita do plano" />
      <ErrorNote message={error} />
    </Modal>
  );
}
