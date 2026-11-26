import { Check, CreditCard, ExternalLink, FileText, Minus, Plus, QrCode, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { CUSTOMER_BILLING_TYPES, MAX_EXTRA_COMPUTERS, trialNotice, type CustomerBillingType } from "../../customer/catalog.ts";
import { api, useApi } from "../../web/api.ts";
import { brl, int } from "../../web/format.ts";
import { Button, Card, ErrorNote, Loading, cx } from "../../web/ui.tsx";
import { rememberedPlan, WhatsAppButton } from "../shared.tsx";

export interface Catalog {
  plans: {
    id: string; code: string; name: string; description: string; price_cents: number; credits_per_month: number; max_bots: number | null; max_companies: number | null;
    included_vps: number; trial_days: number; free_requests_per_day: number; computer_enabled: boolean;
  }[];
  extraComputer: { id: string; name: string; description: string; price_cents: number } | null;
  creditPackages: { id: string; credits: number; priceCents: number }[];
  paymentsAvailable: boolean;
}

export const PAYMENT_OPTIONS: Record<CustomerBillingType, { label: string; hint: string; icon: ReactNode }> = {
  PIX: { label: "Pix", hint: "Confirma em instantes", icon: <QrCode className="h-4 w-4" /> },
  BOLETO: { label: "Boleto", hint: "Compensa em até 3 dias úteis", icon: <FileText className="h-4 w-4" /> },
  CREDIT_CARD: { label: "Cartão de crédito", hint: "Digitado na página segura do Asaas", icon: <CreditCard className="h-4 w-4" /> },
};

export function PaymentChoice({ value, onChange }: { value: CustomerBillingType; onChange: (value: CustomerBillingType) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {CUSTOMER_BILLING_TYPES.map((type) => (
        <button key={type} type="button" onClick={() => onChange(type)}
          className={cx("flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
            value === type ? "border-cyan-ink bg-cyan-soft ring-2 ring-cyan-brand/30" : "border-line bg-white hover:border-slate-300")}>
          <span className={cx("mt-0.5", value === type ? "text-cyan-ink" : "text-slate-400")}>{PAYMENT_OPTIONS[type].icon}</span>
          <span>
            <span className="block text-sm font-semibold text-ink">{PAYMENT_OPTIONS[type].label}</span>
            <span className="block text-xs text-slate-500">{PAYMENT_OPTIONS[type].hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, max = MAX_EXTRA_COMPUTERS }: { value: number; onChange: (value: number) => void; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-white">
      <button type="button" aria-label="Menos" disabled={value <= 0} onClick={() => onChange(value - 1)} className="grid h-10 w-10 place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
      <span className="w-10 text-center font-semibold tabular">{value}</span>
      <button type="button" aria-label="Mais" disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-10 w-10 place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

const bots = (max: number | null) => (max === null ? "Bots ilimitados (uso justo)" : `Até ${max} bots`);
const companies = (max: number | null) => (max === null ? "Empresas ilimitadas" : max === 1 ? "1 empresa" : `Até ${max} empresas`);

function planItems(p: Catalog["plans"][number]): string[] {
  const items = [
    p.credits_per_month > 0 ? `${int(p.credits_per_month)} créditos de IA por mês` : "IA gratuita já inclusa (com limite diário)",
    p.max_bots === 1 ? "1 bot" : bots(p.max_bots),
    companies(p.max_companies),
  ];
  if (p.included_vps > 0) items.push(p.included_vps === 1 ? "1 computador próprio na nuvem incluído" : `${p.included_vps} computadores próprios na nuvem incluídos`);
  items.push("Use também a sua própria conta de IA");
  return items;
}

export function AssinarPage({ trialAvailable, onSubscribed }: { trialAvailable: boolean; onSubscribed: () => void }) {
  const [params] = useSearchParams();
  const { data, error, loading } = useApi<Catalog>("/api/conta/planos");
  const [plan, setPlan] = useState<string | null>(null);
  const [computers, setComputers] = useState(0);
  const [billingType, setBillingType] = useState<CustomerBillingType>("PIX");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoiceUrl: string | null; trialEndsAt: string | null } | null>(null);

  useEffect(() => {
    if (!data || plan) return;
    const wanted = params.get("plano") ?? rememberedPlan();
    setPlan(data.plans.find((p) => p.code === wanted)?.code ?? data.plans.find((p) => p.code === "profissional")?.code ?? data.plans[0]?.code ?? null);
  }, [data, params, plan]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;

  if (result?.trialEndsAt) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Check className="h-7 w-7" /></div>
        <h1 className="mt-4 font-display text-2xl font-bold">Pronto! Seu teste grátis começou.</h1>
        <p className="mt-2 text-sm text-slate-600">
          {trialNotice(result.trialEndsAt, null)}. Pode usar tudo agora mesmo. Se não quiser continuar, cancele no painel antes dessa data e nada é cobrado.
        </p>
        <div className="mt-6"><Link to="/" className="inline-flex h-11 items-center rounded-lg bg-cyan-brand px-5 text-sm font-semibold text-navy-950 shadow-sm hover:brightness-95">Ir para o meu painel</Link></div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Check className="h-7 w-7" /></div>
        <h1 className="mt-4 font-display text-2xl font-bold">Assinatura criada! Falta só o pagamento.</h1>
        <p className="mt-2 text-sm text-slate-600">
          Abra a fatura para pagar com {PAYMENT_OPTIONS[billingType].label.toLowerCase()}. Assim que o pagamento for confirmado, a sua assinatura fica em dia
          e os créditos do plano entram na conta. Enviamos a fatura também para o seu e-mail.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {result.invoiceUrl ? (
            <a href={result.invoiceUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-cyan-brand px-5 text-sm font-semibold text-navy-950 shadow-sm hover:brightness-95">
              <ExternalLink className="h-4 w-4" /> Abrir a fatura e pagar
            </a>
          ) : (
            <p className="text-sm text-slate-500">A fatura aparece no seu painel em instantes.</p>
          )}
          <Link to="/" className="text-sm font-medium text-cyan-ink hover:underline">Ir para o meu painel</Link>
        </div>
      </div>
    );
  }

  const selected = data.plans.find((p) => p.code === plan) ?? null;
  const addonPrice = data.extraComputer?.price_cents ?? 0;
  const total = (selected?.price_cents ?? 0) + computers * addonPrice;

  const subscribe = async () => {
    if (!selected) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const created = await api<{ invoiceUrl: string | null; trialEndsAt: string | null }>("/api/conta/assinatura", { body: { plan: selected.code, extraComputers: computers, billingType } });
      setResult(created);
      onSubscribed();
    } catch (reason) {
      setSubmitError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight">Escolha o seu plano</h1>
      <p className="mt-1 text-sm text-slate-500">Planos mensais, sem fidelidade. Cancele quando quiser, aqui mesmo.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => (
          <button key={p.code} type="button" onClick={() => setPlan(p.code)}
            className={cx("flex flex-col rounded-2xl border bg-white p-5 text-left transition",
              plan === p.code ? "border-cyan-ink shadow-[0_20px_40px_-25px_rgba(7,134,160,0.7)] ring-2 ring-cyan-brand/40" : "border-line hover:border-slate-300")}>
            <span className="flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-semibold">{p.name}</span>
                {trialAvailable && p.trial_days > 0 ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{p.trial_days} dias grátis</span> : null}
              </span>
              <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full border", plan === p.code ? "border-cyan-ink bg-cyan-ink text-white" : "border-slate-300")}>
                {plan === p.code ? <Check className="h-3 w-3" /> : null}
              </span>
            </span>
            <span className="mt-2 text-sm font-semibold leading-snug text-ink">{p.description}</span>
            <span className="mt-3"><span className="font-display text-3xl font-bold tabular">{brl(p.price_cents)}</span><span className="text-sm text-slate-500"> /mês</span></span>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
              {planItems(p).map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" />{item}</li>)}
            </ul>
          </button>
        ))}
      </div>
      {trialAvailable && selected && selected.trial_days > 0 ? <p className="mt-3 text-xs text-slate-500">O teste grátis vale para a primeira assinatura de cada CPF/CNPJ. A primeira cobrança vem no fim do teste; cancele antes e nada é cobrado.</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.extraComputer ? (
            <Card title="Computadores individuais adicionais (opcional)">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-md text-sm text-slate-600">Dê a um bot o seu próprio computador (VPS). <b>{brl(addonPrice)}/mês por bot</b>. Você pode mudar depois no painel.</p>
                <Stepper value={computers} onChange={setComputers} />
              </div>
            </Card>
          ) : null}
          <Card title="Forma de pagamento">
            <PaymentChoice value={billingType} onChange={setBillingType} />
            <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              O pagamento é feito na página segura do Asaas, nosso parceiro de cobrança. Não pedimos nem guardamos dados de cartão.
            </p>
          </Card>
        </div>

        <Card title="Resumo" className="h-fit">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Plano {selected?.name}</dt><dd className="tabular">{brl(selected?.price_cents ?? 0)}</dd></div>
            {computers > 0 ? <div className="flex justify-between"><dt className="text-slate-500">{computers} computador{computers > 1 ? "es" : ""} adicional{computers > 1 ? "is" : ""}</dt><dd className="tabular">{brl(computers * addonPrice)}</dd></div> : null}
            <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total por mês</dt><dd className="tabular">{brl(total)}</dd></div>
          </dl>
          <div className="mt-5 space-y-3">
            {data.paymentsAvailable ? (
              <>
                <ErrorNote message={submitError} />
                <Button variant="accent" className="w-full" busy={busy} disabled={!selected} onClick={subscribe}>{trialAvailable && selected && selected.trial_days > 0 ? `Começar ${selected.trial_days} dias grátis` : "Assinar e pagar"}</Button>
                <p className="text-xs text-slate-500">Arrependeu-se? Cancele em até 7 dias e devolvemos o valor, como garante o Código de Defesa do Consumidor.</p>
              </>
            ) : (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Pagamentos ainda não estão disponíveis.</p>
                <p className="mt-1">Fale com a gente pelo WhatsApp que ativamos a sua assinatura.</p>
                <WhatsAppButton className="mt-3 w-full" message={`Olá! Quero assinar o plano ${selected?.name ?? ""} do ArkoBot.`} />
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
