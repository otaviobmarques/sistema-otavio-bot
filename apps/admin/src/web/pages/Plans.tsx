import { Bot, Building, Cpu, HardDrive, Globe, KeyRound, MonitorCog, Pencil, Plus, Server } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "../api.ts";
import { canWrite, useMe } from "../App.tsx";
import { brl, int } from "../format.ts";
import { Badge, Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea, useToast } from "../ui.tsx";

export interface PlanRow {
  id: string; code: string; name: string; description: string; price_cents: number; billing_cycle: "monthly" | "yearly"; credits_per_month: number;
  max_bots: number | null; max_companies: number | null; ram_mb: number; disk_gb: number; included_vps: number; allowed_models: string[];
  default_model: string | null; free: boolean; cloud_mode: string; browser_enabled: boolean; computer_enabled: boolean; allow_byo_ai: boolean;
  idle_sleep_minutes: number | null; inactive_delete_days: number | null; daily_credit_cap: number | null; monthly_credit_cap: number | null;
  per_request_credit_cap: number | null; active: boolean; visible: boolean; sort_order: number; subscribers: number;
}

interface AddonRow { id: string; code: string; name: string; description: string; price_cents: number; unit: string; paid_plans_only: boolean; active: boolean }

const CLOUD_MODE: Record<string, string> = { dedicated: "Instância dedicada", shared_limited: "Nuvem compartilhada (limitada)", none: "Só no PC do usuário" };

export function PlansPage() {
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<{ plans: PlanRow[]; addons: AddonRow[] }>("/api/plans");
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  const [addon, setAddon] = useState<AddonRow | null>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const writable = canWrite(me);
  return (
    <>
      <PageHeader title="Planos" subtitle="Preço, cota mensal de créditos (1 crédito = R$ 0,01), limites e modelos de IA de cada plano."
        actions={writable ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Novo plano</Button> : null} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {data.plans.map((plan) => (
          <section key={plan.id} className={`flex flex-col rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${plan.active ? "border-line" : "border-dashed border-slate-300 opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-bold">{plan.name}</h2>
                  {plan.free ? <Badge tone="cyan">grátis</Badge> : null}
                  {!plan.active ? <Badge>inativo</Badge> : !plan.visible ? <Badge>oculto</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{plan.code} · {plan.subscribers} assinante{plan.subscribers === 1 ? "" : "s"}</p>
              </div>
              {writable ? <Button size="sm" variant="ghost" onClick={() => setEditing(plan)}><Pencil className="h-3.5 w-3.5" /> Editar</Button> : null}
            </div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold tabular">{plan.free ? "R$ 0" : brl(plan.price_cents)}</span>
              <span className="text-sm text-slate-500">/{plan.billing_cycle === "yearly" ? "ano" : "mês"}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{plan.description}</p>
            <div className="mt-4 rounded-xl bg-cyan-soft px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-ink">Créditos por mês</div>
              <div className="font-display text-xl font-bold tabular text-navy-950">{int(plan.credits_per_month)} <span className="text-sm font-medium text-slate-600">≈ {brl(plan.credits_per_month)} em IA</span></div>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2"><Bot className="h-4 w-4 text-slate-400" />{plan.max_bots === null ? "Bots sem limite" : `${plan.max_bots} bot${plan.max_bots === 1 ? "" : "s"}`}</li>
              <li className="flex items-center gap-2"><Building className="h-4 w-4 text-slate-400" />{plan.max_companies === null ? "Empresas sem limite" : `${plan.max_companies} empresa${plan.max_companies === 1 ? "" : "s"}`}</li>
              <li className="flex items-center gap-2"><Cpu className="h-4 w-4 text-slate-400" />{plan.ram_mb >= 1024 ? `${plan.ram_mb / 1024} GB RAM` : `${plan.ram_mb} MB RAM`}</li>
              <li className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-slate-400" />{plan.disk_gb} GB disco</li>
              <li className="flex items-center gap-2"><Server className="h-4 w-4 text-slate-400" />{plan.included_vps} VPS incluído{plan.included_vps === 1 ? "" : "s"}</li>
              <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" />{plan.browser_enabled ? "Com navegador" : "Sem navegador"}</li>
              <li className="col-span-2 flex items-center gap-2"><MonitorCog className="h-4 w-4 text-slate-400" />{CLOUD_MODE[plan.cloud_mode]}{plan.idle_sleep_minutes ? ` · dorme após ${plan.idle_sleep_minutes} min` : ""}</li>
              <li className="col-span-2 flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-400" />{plan.allow_byo_ai ? "Aceita a própria conta/chave de IA do cliente" : "Só os créditos inclusos"}</li>
            </ul>
            <div className="mt-4 border-t border-line pt-4 text-xs text-slate-600">
              <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Tetos de créditos</div>
              <div className="tabular">diário {plan.daily_credit_cap ? int(plan.daily_credit_cap) : "—"} · mensal {plan.monthly_credit_cap ? int(plan.monthly_credit_cap) : "a cota"} · por requisição {plan.per_request_credit_cap ? int(plan.per_request_credit_cap) : "—"}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {plan.allowed_models.length === 0 ? <span className="text-xs text-slate-500">Todos os modelos</span> : plan.allowed_models.map((model) => (
                <span key={model} className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${model === plan.default_model ? "bg-navy-950 text-cyan-brand" : "bg-slate-100 text-slate-700"}`}>{model}</span>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Card title="Adicionais" className="mt-8" padded={false}>
        <ul className="divide-y divide-line">
          {data.addons.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
              <div>
                <div className="font-medium">{row.name} {!row.active ? <Badge>inativo</Badge> : null}</div>
                <div className="text-xs text-slate-500">{row.description}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-display text-lg font-bold tabular">{brl(row.price_cents)}<span className="text-xs font-normal text-slate-500">/mês {row.unit === "per_bot" ? "por bot" : ""}</span></span>
                {row.paid_plans_only ? <Badge tone="cyan">planos pagos</Badge> : null}
                {writable ? <Button size="sm" variant="ghost" onClick={() => setAddon(row)}><Pencil className="h-3.5 w-3.5" /> Editar</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {editing ? <PlanEditor plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
      {addon ? <AddonEditor addon={addon} onClose={() => setAddon(null)} onSaved={() => { setAddon(null); reload(); }} /> : null}
    </>
  );
}

const optional = (value: string) => (value.trim() === "" ? null : Math.round(Number(value)));

function PlanEditor({ plan, onClose, onSaved }: { plan: PlanRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    code: plan?.code ?? "", name: plan?.name ?? "", description: plan?.description ?? "",
    price: plan ? (plan.price_cents / 100).toFixed(2).replace(".", ",") : "", billingCycle: plan?.billing_cycle ?? "monthly",
    credits: String(plan?.credits_per_month ?? ""), maxBots: plan?.max_bots === null ? "" : String(plan?.max_bots ?? 1),
    maxCompanies: plan?.max_companies === null ? "" : String(plan?.max_companies ?? 1), ramMb: String(plan?.ram_mb ?? 2048), diskGb: String(plan?.disk_gb ?? 20),
    includedVps: String(plan?.included_vps ?? 0), models: (plan?.allowed_models ?? []).join("\n"), defaultModel: plan?.default_model ?? "",
    free: plan?.free ?? false, cloudMode: plan?.cloud_mode ?? "dedicated", browser: plan?.browser_enabled ?? true, computer: plan?.computer_enabled ?? true, byoAi: plan?.allow_byo_ai ?? true,
    idle: String(plan?.idle_sleep_minutes ?? ""), deleteDays: String(plan?.inactive_delete_days ?? ""), daily: String(plan?.daily_credit_cap ?? ""),
    monthly: String(plan?.monthly_credit_cap ?? ""), perRequest: String(plan?.per_request_credit_cap ?? ""), active: plan?.active ?? true,
    visible: plan?.visible ?? true, sortOrder: String(plan?.sort_order ?? 0),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof f) => (event: { target: { value: string } }) => setF({ ...f, [key]: event.target.value });
  const save = async () => {
    setBusy(true);
    setError(null);
    const priceCents = f.free ? 0 : Math.round(Number(f.price.replace(/\./g, "").replace(",", ".")) * 100);
    const body = {
      code: f.code, name: f.name, description: f.description, priceCents, billingCycle: f.billingCycle, creditsPerMonth: Number(f.credits || 0),
      maxBots: optional(f.maxBots), maxCompanies: optional(f.maxCompanies), ramMb: Number(f.ramMb), diskGb: Number(f.diskGb), includedVps: Number(f.includedVps),
      allowedModels: f.models.split(/[\n,]/).map((m) => m.trim()).filter(Boolean), defaultModel: f.defaultModel.trim() || null, free: f.free,
      cloudMode: f.cloudMode, browserEnabled: f.browser, computerEnabled: f.computer, allowByoAi: f.byoAi, idleSleepMinutes: optional(f.idle),
      inactiveDeleteDays: optional(f.deleteDays), dailyCreditCap: optional(f.daily), monthlyCreditCap: optional(f.monthly),
      perRequestCreditCap: optional(f.perRequest), active: f.active, visible: f.visible, sortOrder: Number(f.sortOrder || 0),
    };
    try {
      await api(plan ? `/api/plans/${plan.id}` : "/api/plans", { method: plan ? "PUT" : "POST", body });
      toast(plan ? "Plano salvo" : "Plano criado");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal wide title={plan ? `Editar plano ${plan.name}` : "Novo plano"} open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Salvar</Button></>}>
      {plan && plan.subscribers > 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Este plano tem assinantes. Mudar preço ou cota vale para novas assinaturas; as atuais mantêm o valor contratado.</p> : null}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Nome"><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Código"><Input value={f.code} onChange={set("code")} placeholder="essencial" /></Field>
        <Field label="Ordem"><Input inputMode="numeric" value={f.sortOrder} onChange={set("sortOrder")} /></Field>
      </div>
      <Field label="Descrição"><Textarea value={f.description} onChange={set("description")} className="min-h-14" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Preço (R$)"><Input value={f.free ? "0,00" : f.price} disabled={f.free} onChange={set("price")} placeholder="159,00" /></Field>
        <Field label="Ciclo"><Select value={f.billingCycle} onChange={set("billingCycle")}><option value="monthly">Mensal</option><option value="yearly">Anual</option></Select></Field>
        <Field label="Créditos por mês"><Input inputMode="numeric" value={f.credits} onChange={set("credits")} /></Field>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <Field label="Bots" hint="vazio = sem limite"><Input inputMode="numeric" value={f.maxBots} onChange={set("maxBots")} /></Field>
        <Field label="Empresas" hint="vazio = sem limite"><Input inputMode="numeric" value={f.maxCompanies} onChange={set("maxCompanies")} /></Field>
        <Field label="RAM (MB)"><Input inputMode="numeric" value={f.ramMb} onChange={set("ramMb")} /></Field>
        <Field label="Disco (GB)"><Input inputMode="numeric" value={f.diskGb} onChange={set("diskGb")} /></Field>
        <Field label="VPS incluídos"><Input inputMode="numeric" value={f.includedVps} onChange={set("includedVps")} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Teto diário" hint="créditos/dia"><Input inputMode="numeric" value={f.daily} onChange={set("daily")} /></Field>
        <Field label="Teto mensal" hint="vazio = a própria cota"><Input inputMode="numeric" value={f.monthly} onChange={set("monthly")} /></Field>
        <Field label="Teto por requisição"><Input inputMode="numeric" value={f.perRequest} onChange={set("perRequest")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Modelos permitidos" hint="Um por linha. Vazio = todos."><Textarea value={f.models} onChange={set("models")} className="min-h-28 font-mono text-xs" /></Field>
        <div className="space-y-3">
          <Field label="Modelo padrão"><Input value={f.defaultModel} onChange={set("defaultModel")} className="font-mono text-xs" /></Field>
          <Field label="Onde roda"><Select value={f.cloudMode} onChange={set("cloudMode")}>{Object.entries(CLOUD_MODE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dorme após (min)"><Input inputMode="numeric" value={f.idle} onChange={set("idle")} /></Field>
            <Field label="Exclui após (dias)"><Input inputMode="numeric" value={f.deleteDays} onChange={set("deleteDays")} /></Field>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4">
        <Checkbox label="Plano gratuito" checked={f.free} onChange={(free) => setF({ ...f, free })} hint="Preço zero, sem cobrança" />
        <Checkbox label="Navegador" checked={f.browser} onChange={(browser) => setF({ ...f, browser })} />
        <Checkbox label="Computador" checked={f.computer} onChange={(computer) => setF({ ...f, computer })} />
        <Checkbox label="IA própria do cliente" checked={f.byoAi} onChange={(byoAi) => setF({ ...f, byoAi })} hint="Conta ou chave dele; não debita créditos" />
        <Checkbox label="Ativo" checked={f.active} onChange={(active) => setF({ ...f, active })} hint="Aceita novas assinaturas" />
        <Checkbox label="Visível" checked={f.visible} onChange={(visible) => setF({ ...f, visible })} hint="Aparece no site" />
      </div>
      <ErrorNote message={error} />
    </Modal>
  );
}

function AddonEditor({ addon, onClose, onSaved }: { addon: AddonRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: addon.name, description: addon.description, price: (addon.price_cents / 100).toFixed(2).replace(".", ","), active: addon.active });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/plans/addons/${addon.id}`, { method: "PUT", body: { name: f.name, description: f.description, priceCents: Math.round(Number(f.price.replace(",", ".")) * 100), active: f.active } });
      toast("Adicional salvo");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Editar adicional" open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Salvar</Button></>}>
      <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Descrição"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Preço mensal (R$)" hint="Vale para novos adicionais; os já contratados mantêm o valor."><Input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
      <Checkbox label="Ativo" checked={f.active} onChange={(active) => setF({ ...f, active })} />
      <ErrorNote message={error} />
    </Modal>
  );
}
