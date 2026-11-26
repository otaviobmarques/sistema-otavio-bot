import { ArrowUpRight, Coins, Download, ExternalLink, KeyRound, Monitor, ReceiptText, ShieldAlert, Sparkles, Trash2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { trialNotice, whatsappLink, type CustomerBillingType } from "../../customer/catalog.ts";
import { api, useApi } from "../../web/api.ts";
import { brl, date, dateTime, int, LEDGER_KIND, PAYMENT_STATUS } from "../../web/format.ts";
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, Modal, StatusBadge, Table, td, Textarea, useToast, cx } from "../../web/ui.tsx";
import { CUSTOMER_BILLING_LABEL, CUSTOMER_SUB_STATUS, WhatsAppButton, type CustomerState } from "../shared.tsx";
import { PaymentChoice, Stepper } from "./Assinar.tsx";
import { MeuArkoBotCard } from "./MeuArkoBot.tsx";

interface Payment {
  id: string; kind: "subscription" | "credit_purchase"; status: string; billing_type: string | null; value_cents: number; credits: number;
  due_date: string | null; paid_at: string | null; invoice_url: string | null; pix_payload: string | null; created_at: string;
}

interface Panel {
  organization: { id: string; name: string; status: string; status_reason_code: string | null };
  role: "owner" | "admin" | "member";
  subscription: null | {
    id: string; status: string; billing_type: string | null; price_cents: number; total_cents: number; credits_per_month: number; plan_code: string; plan_name: string;
    included_vps: number; next_due_date: string | null; current_period_end: string | null; past_due_since: string | null; canceled_at: string | null; created_at: string;
    courtesy: boolean; courtesy_until: string | null; trial_ends_at: string | null; free_requests_per_day: number;
  };
  addons: { code: string; name: string; quantity: number; unit_price_cents: number }[];
  payments: Payment[];
  wallet: { plan: number; extra: number };
  ledger: { id: number; created_at: string; bucket: "plan" | "extra"; kind: string; amount: number; balance_after: number }[];
  deletionRequest: null | { id: string; status: string; created_at: string; resolved_at: string | null };
  extraComputer: { id: string; name: string; price_cents: number } | null;
  creditPackages: { id: string; credits: number; priceCents: number }[];
  paymentsAvailable: boolean;
  freeRequestsToday: number;
  upgrade: null | { code: string; name: string; unlocks: string };
}

interface ChargeResult { valueCents: number; credits: number; invoiceUrl: string | null; pix: { encodedImage: string; payload: string } | null }

type Dialog = null | "credits" | "computers" | "cancel" | "delete";

function openInvoice(payments: Payment[]): Payment | null {
  return payments.filter((p) => p.kind === "subscription" && (p.status === "pending" || p.status === "overdue") && p.invoice_url)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0] ?? null;
}

function PayButton({ payment, children = "Pagar fatura" }: { payment: Payment | null; children?: ReactNode }) {
  if (!payment?.invoice_url) return null;
  return (
    <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-brand px-4 text-sm font-semibold text-navy-950 shadow-sm hover:brightness-95">
      <ExternalLink className="h-4 w-4" /> {children} {payment.value_cents ? `· ${brl(payment.value_cents)}` : null}
    </a>
  );
}

function statusCopy(panel: Panel): { title: string; text: ReactNode; tone: string } {
  const sub = panel.subscription!;
  switch (sub.status) {
    case "pending":
      return { title: "Aguardando o primeiro pagamento", tone: "bg-cyan-soft text-cyan-ink",
        text: <>Assim que o pagamento for confirmado, a assinatura fica em dia{sub.credits_per_month > 0 ? <> e os {int(sub.credits_per_month)} créditos do plano entram na sua conta</> : null}. Pix e cartão confirmam em minutos; boleto em até 3 dias úteis.</> };
    case "active":
      if (sub.courtesy) {
        return { title: `Plano ${sub.plan_name} — cortesia (sem cobrança)`, tone: "bg-violet-50 text-violet-900",
          text: <>{sub.courtesy_until ? <>Válida até <b>{date(sub.courtesy_until)}</b>. </> : null}Os {int(sub.credits_per_month)} créditos do plano renovam todo mês, sem cobrança. Para mudar de plano ou encerrar a cortesia, fale com a gente.</> };
      }
      if (sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now()) {
        return { title: trialNotice(sub.trial_ends_at, sub.next_due_date), tone: "bg-cyan-soft text-navy-900",
          text: <>Aproveite tudo do plano {sub.plan_name} agora. Se não quiser continuar, cancele antes dessa data: nada é cobrado.</> };
      }
      return { title: "Tudo em dia", tone: "bg-emerald-50 text-emerald-800",
        text: <>Sua equipe está funcionando. {sub.next_due_date ? <>A próxima cobrança vence em <b>{date(sub.next_due_date)}</b>.</> : null}</> };
    case "past_due":
      return { title: "Pagamento em atraso", tone: "bg-red-50 text-red-700",
        text: <>Há uma fatura vencida{sub.past_due_since ? <> desde {date(sub.past_due_since)}</> : null}. Pague para evitar a pausa dos bots: depois de 7 dias em atraso a conta é suspensa.</> };
    case "suspended":
      return { title: "Assinatura suspensa", tone: "bg-amber-50 text-amber-900",
        text: <>Seus bots estão pausados. {panel.organization.status_reason_code === "chargeback" ? "Houve uma contestação do pagamento; fale com a gente para resolver." : "Pague a fatura em aberto e tudo volta a funcionar sozinho em minutos."}</> };
    default:
      return { title: "Assinatura cancelada", tone: "bg-slate-100 text-slate-700",
        text: <>Sua assinatura foi cancelada{sub.canceled_at ? <> em {date(sub.canceled_at)}</> : null}. Quando quiser voltar, é só assinar de novo.</> };
  }
}

export function PainelPage({ state, onChanged }: { state: CustomerState; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<Panel>("/api/conta/painel");
  const [dialog, setDialog] = useState<Dialog>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const sub = data.subscription;
  const live = sub && sub.status !== "canceled" ? sub : null;
  const canManage = data.role !== "member";
  const invoice = openInvoice(data.payments);
  const computers = data.addons.find((a) => a.code === "computador-adicional")?.quantity ?? 0;
  const copy = sub ? statusCopy(data) : null;
  const done = () => {
    setDialog(null);
    reload();
    onChanged();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Olá, {state.account.name.split(" ")[0] || "tudo bem"}!</h1>
        <p className="mt-1 text-sm text-slate-500">{data.organization.name}</p>
      </div>

      {data.deletionRequest?.status === "requested" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Você pediu a exclusão da conta em {date(data.deletionRequest.created_at)}. Nossa equipe vai concluir o pedido e avisar por e-mail.</span>
        </div>
      ) : null}

      {sub && copy ? (
        <Card title={<span className="flex items-center gap-2">Assinatura <StatusBadge map={CUSTOMER_SUB_STATUS} value={sub.status} /></span>}
          actions={canManage && live && !live.courtesy ? <Button size="sm" variant="ghost" onClick={() => setDialog("cancel")}><XCircle className="h-3.5 w-3.5" /> Cancelar assinatura</Button> : null}>
          <div className={cx("rounded-xl p-4", copy.tone)}>
            <div className="font-semibold">{copy.title}</div>
            <p className="mt-1 text-sm">{copy.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {live && sub.status !== "active" ? <PayButton payment={invoice} /> : null}
              {sub.status === "canceled" && canManage ? <Link to="/assinar" className="inline-flex h-10 items-center rounded-lg bg-navy-950 px-4 text-sm font-medium text-white hover:bg-navy-800">Assinar de novo</Link> : null}
              {sub.status === "suspended" || sub.status === "past_due" ? <WhatsAppButton>Preciso de ajuda</WhatsAppButton> : null}
              {live?.courtesy ? <WhatsAppButton message="Olá! Quero falar sobre a cortesia do meu plano ArkoBot.">Falar com a gente</WhatsAppButton> : null}
            </div>
            {live && sub.status !== "active" && !invoice ? <p className="mt-2 text-xs opacity-80">A fatura aparece aqui em instantes; ela também foi enviada para o seu e-mail.</p> : null}
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Plano</dt><dd className="mt-1 font-semibold">{sub.plan_name}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Valor por mês</dt><dd className="mt-1 font-semibold tabular">{sub.courtesy ? "Sem cobrança" : brl(sub.total_cents)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Forma de pagamento</dt><dd className="mt-1 font-semibold">{sub.courtesy ? "Cortesia" : sub.billing_type ? CUSTOMER_BILLING_LABEL[sub.billing_type] ?? sub.billing_type : "—"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Créditos do plano</dt><dd className="mt-1 font-semibold tabular">{int(sub.credits_per_month)}/mês</dd></div>
          </dl>
        </Card>
      ) : null}

      {sub ? <MeuArkoBotCard /> : null}

      {live && live.free_requests_per_day > 0 ? <FreeAiCard used={data.freeRequestsToday} perDay={live.free_requests_per_day} /> : null}

      {data.upgrade && live ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
          <span className="flex items-start gap-2.5">
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" />
            <span><b>Faça upgrade para o {data.upgrade.name}:</b> {data.upgrade.unlocks}.</span>
          </span>
          <a href={whatsappLink(`Olá! Quero mudar do plano ${live.plan_name} para o ${data.upgrade.name} do ArkoBot.`)} target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-cyan-ink hover:underline">Falar com a gente para mudar</a>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Coins className="h-4 w-4 text-cyan-ink" /> Créditos de IA</span>}
          actions={canManage && live ? <Button size="sm" variant="accent" onClick={() => setDialog("credits")}>Comprar créditos</Button> : null}>
          <div className="font-display text-4xl font-bold tabular">{int(data.wallet.plan + data.wallet.extra)}</div>
          <div className="mt-1 text-sm text-slate-500">1 crédito = R$ 0,01 de uso de IA</div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Do plano (renovam todo mês)</div><div className="mt-1 font-semibold tabular">{int(data.wallet.plan)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Avulsos (não expiram)</div><div className="mt-1 font-semibold tabular">{int(data.wallet.extra)}</div></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Usar uma conta de IA sua não gasta créditos.</p>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Monitor className="h-4 w-4 text-cyan-ink" /> Computadores individuais</span>}
          actions={canManage && live && !live.courtesy && data.extraComputer ? <Button size="sm" variant="secondary" onClick={() => setDialog("computers")}>Alterar</Button> : null}>
          <div className="font-display text-4xl font-bold tabular">{(live?.included_vps ?? 0) + computers}</div>
          <div className="mt-1 text-sm text-slate-500">
            {live?.included_vps ? `${live.included_vps} incluído${live.included_vps > 1 ? "s" : ""} no plano` : "Nenhum incluído no plano"}
            {computers ? ` + ${computers} adicional${computers > 1 ? "is" : ""}` : ""}
          </div>
          {data.extraComputer ? <p className="mt-4 text-sm text-slate-600">Cada computador adicional dá a um bot o seu próprio computador (VPS) por {brl(data.extraComputer.price_cents)}/mês.</p> : null}
        </Card>
      </div>

      {live?.courtesy && data.payments.length === 0 ? null : <Card title={<span className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-cyan-ink" /> Pagamentos</span>} padded={false}>
        <Table head={["Vencimento", "Descrição", "Valor", "Forma", "Situação", ""]} empty="Nenhum pagamento ainda.">
          {data.payments.map((p) => (
            <tr key={p.id}>
              <td className={`${td} whitespace-nowrap`}>{date(p.due_date)}</td>
              <td className={td}>{p.kind === "credit_purchase" ? `${int(p.credits)} créditos avulsos` : "Assinatura"}</td>
              <td className={`${td} tabular`}>{brl(p.value_cents)}</td>
              <td className={td}>{p.billing_type ? CUSTOMER_BILLING_LABEL[p.billing_type] ?? p.billing_type : "—"}</td>
              <td className={td}><StatusBadge map={PAYMENT_STATUS} value={p.status} />{p.paid_at ? <div className="mt-0.5 text-xs text-slate-500">pago em {date(p.paid_at)}</div> : null}</td>
              <td className={`${td} text-right`}>
                {p.invoice_url ? (
                  <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-sm font-medium text-cyan-ink hover:underline">
                    {p.status === "pending" || p.status === "overdue" ? (p.billing_type === "BOLETO" ? "Ver boleto" : p.billing_type === "PIX" ? "Pagar com Pix" : "Pagar") : "Ver fatura"}
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>}

      <Card title="Extrato de créditos" padded={false}>
        {data.ledger.length === 0 ? (
          <Empty icon={<Coins className="h-6 w-6" />} title="Nenhum lançamento ainda">Os créditos do plano entram quando o pagamento é confirmado.</Empty>
        ) : (
          <Table head={["Data", "Lançamento", "Saldo", "Créditos", "Saldo depois"]}>
            {data.ledger.map((row) => (
              <tr key={row.id}>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.created_at)}</td>
                <td className={td}>{LEDGER_KIND[row.kind] ?? row.kind}</td>
                <td className={td}><Badge tone={row.bucket === "plan" ? "cyan" : "violet"}>{row.bucket === "plan" ? "plano" : "avulso"}</Badge></td>
                <td className={`${td} tabular font-semibold ${row.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{row.amount > 0 ? "+" : ""}{int(row.amount)}</td>
                <td className={`${td} tabular`}>{int(row.balance_after)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Seus dados e privacidade">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-slate-600">Baixe uma cópia dos dados que guardamos sobre você e a sua empresa, ou peça a exclusão da sua conta (LGPD).</p>
          <div className="flex flex-wrap gap-2">
            <ExportButton />
            {data.deletionRequest?.status !== "requested" ? <Button variant="ghost" onClick={() => setDialog("delete")}><Trash2 className="h-4 w-4" /> Excluir minha conta</Button> : null}
          </div>
        </div>
      </Card>

      <CreditsDialog open={dialog === "credits"} packages={data.creditPackages} onClose={() => setDialog(null)} onCreated={reload} />
      <ComputersDialog open={dialog === "computers"} current={computers} panel={data} onClose={() => setDialog(null)} onDone={done} />
      <CancelDialog open={dialog === "cancel"} createdAt={sub?.created_at ?? null} trialEndsAt={live?.trial_ends_at ?? null} onClose={() => setDialog(null)} onDone={done} />
      <DeleteDialog open={dialog === "delete"} hasLiveSubscription={live !== null} onClose={() => setDialog(null)} onDone={done} />
    </div>
  );
}

function ExportButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/conta/dados", { credentials: "same-origin" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `Erro ${response.status}`);
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "arkobot-meus-dados.json";
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      toast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return <Button variant="secondary" busy={busy} onClick={download}><Download className="h-4 w-4" /> Exportar meus dados</Button>;
}

function CreditsDialog({ open, packages, onClose, onCreated }: { open: boolean; packages: Panel["creditPackages"]; onClose: () => void; onCreated: () => void }) {
  const [selected, setSelected] = useState(packages[1]?.id ?? packages[0]?.id ?? "");
  const [billingType, setBillingType] = useState<CustomerBillingType>("PIX");
  const [result, setResult] = useState<ChargeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setResult(null);
    setError(null);
    onClose();
  };
  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<ChargeResult>("/api/conta/creditos", { body: { package: selected, billingType } }));
      onCreated();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Comprar créditos avulsos" open={open} onClose={close} footer={result ? <Button onClick={close}>Fechar</Button> : <>
      <Button variant="secondary" onClick={close}>Voltar</Button>
      <Button variant="accent" busy={busy} disabled={!selected} onClick={buy}>Gerar cobrança</Button>
    </>}>
      {result ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600"><b>{int(result.credits)} créditos</b> por <b>{brl(result.valueCents)}</b>. Eles entram na sua conta assim que o pagamento for confirmado.</p>
          {result.pix ? (
            <>
              <img src={`data:image/png;base64,${result.pix.encodedImage}`} alt="QR Code Pix" className="mx-auto h-52 w-52 rounded-xl border border-line" />
              <Field label="Pix copia e cola"><Textarea readOnly value={result.pix.payload} className="font-mono text-xs" onFocus={(e) => e.target.select()} /></Field>
            </>
          ) : null}
          {result.invoiceUrl ? (
            <a href={result.invoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-ink hover:underline">
              <ExternalLink className="h-4 w-4" /> {billingType === "BOLETO" ? "Abrir o boleto" : billingType === "CREDIT_CARD" ? "Pagar com cartão" : "Abrir a fatura"}
            </a>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {packages.map((pkg) => (
              <button key={pkg.id} type="button" onClick={() => setSelected(pkg.id)}
                className={cx("rounded-xl border p-4 text-left transition", selected === pkg.id ? "border-cyan-ink bg-cyan-soft ring-2 ring-cyan-brand/30" : "border-line hover:border-slate-300")}>
                <span className="block font-display text-xl font-bold tabular">{int(pkg.credits)}</span>
                <span className="block text-xs text-slate-500">créditos</span>
                <span className="mt-2 block text-sm font-semibold tabular">{brl(pkg.priceCents)}</span>
              </button>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Forma de pagamento</div>
            <PaymentChoice value={billingType} onChange={setBillingType} />
          </div>
          <p className="text-xs text-slate-500">Créditos avulsos não expiram e são usados depois dos créditos do plano.</p>
          <ErrorNote message={error} />
        </>
      )}
    </Modal>
  );
}

function ComputersDialog({ open, current, panel, onClose, onDone }: { open: boolean; current: number; panel: Panel; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [quantity, setQuantity] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = panel.extraComputer?.price_cents ?? 0;
  const base = (panel.subscription?.total_cents ?? 0) - current * price;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/conta/assinatura/computadores", { body: { quantity } });
      toast("Computadores adicionais atualizados");
      onDone();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Computadores adicionais" open={open} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Voltar</Button>
      <Button busy={busy} disabled={quantity === current} onClick={save}>Salvar</Button>
    </>}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">{brl(price)}/mês por computador. O novo valor vale a partir da próxima cobrança.</p>
        <Stepper value={quantity} onChange={setQuantity} />
      </div>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">Novo total por mês: <b className="tabular">{brl(base + quantity * price)}</b></div>
      <ErrorNote message={error} />
    </Modal>
  );
}

function FreeAiCard({ used, perDay }: { used: number; perDay: number }) {
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-ink" /> IA gratuita já incluída (com limite diário)</span>}>
      <p className="text-sm text-slate-600">Seus bots já funcionam com a IA gratuita do ArkoBot: não precisa configurar nada. O limite é de <b className="tabular">{int(perDay)}</b> pedidos por dia e volta à meia-noite.</p>
      <div className="mt-3 text-sm">Hoje: <b className="tabular">{int(Math.min(used, perDay))}</b> de {int(perDay)}</div>
      <details className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink"><KeyRound className="h-4 w-4 text-cyan-ink" /> Quer mais? Conecte sua própria conta ou chave de IA (opcional)</summary>
        <p className="mt-3">O uso com a sua própria chave não tem o limite diário do ArkoBot e não gasta créditos. A chave fica no seu app ArkoBot; não pedimos chaves aqui.</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Chave gratuita do Google Gemini: entre em <a className="font-medium text-cyan-ink hover:underline" href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer">aistudio.google.com</a> com a sua conta Google e clique em <b>Get API key</b> (Criar chave de API). O plano gratuito do Google tem limites por dia.</li>
          <li>No app ArkoBot, abra <b>Configurações → Chaves de API</b> e, em <b>Seus próprios servidores de modelos</b>, cole a chave em <b>Chave de API compatível com a OpenAI</b>.</li>
          <li>Em <b>URL base compatível com a OpenAI</b>, informe <code className="rounded bg-white px-1 font-mono text-xs">https://generativelanguage.googleapis.com/v1beta/openai</code>.</li>
          <li>Prefere Claude ou ChatGPT? Na mesma tela, em <b>Provedores de IA</b>, cole a chave da Anthropic ou da OpenAI.</li>
        </ol>
      </details>
    </Card>
  );
}

function CancelDialog({ open, createdAt, trialEndsAt, onClose, onDone }: { open: boolean; createdAt: string | null; trialEndsAt: string | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duringTrial = trialEndsAt !== null && new Date(trialEndsAt).getTime() > Date.now();
  const recent = !duringTrial && createdAt !== null && Date.now() - new Date(createdAt).getTime() <= 7 * 86_400_000;
  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/conta/assinatura/cancelar", { body: { reason } });
      toast("Assinatura cancelada");
      onDone();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Cancelar assinatura" open={open} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Manter assinatura</Button>
      <Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={cancel}>Cancelar assinatura</Button>
    </>}>
      <p className="text-sm text-slate-600">As cobranças futuras param na hora e os seus bots são pausados. Seus créditos e dados continuam guardados se você voltar.</p>
      {duringTrial ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Você está no teste grátis: cancelando agora, nada é cobrado.</p> : null}
      {recent ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Você assinou há menos de 7 dias: tem direito ao reembolso integral. Nossa equipe entra em contato para devolver o valor.</p>
      ) : null}
      <Field label="Por que você está cancelando?"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conte em poucas palavras; isso nos ajuda a melhorar." /></Field>
      <ErrorNote message={error} />
    </Modal>
  );
}

function DeleteDialog({ open, hasLiveSubscription, onClose, onDone }: { open: boolean; hasLiveSubscription: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/conta/exclusao", { body: { reason: reason || null, confirm: true } });
      toast("Pedido de exclusão registrado");
      onDone();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Excluir minha conta" open={open} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Voltar</Button>
      <Button variant="danger" busy={busy} disabled={!confirm} onClick={send}>Pedir exclusão</Button>
    </>}>
      <p className="text-sm text-slate-600">
        Vamos apagar os seus dados pessoais e os dos seus bots. Por lei, guardamos pelo prazo obrigatório os registros de pagamentos, notas fiscais,
        o extrato de créditos e os registros de acesso.
      </p>
      {hasLiveSubscription ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Sua assinatura ainda está ativa: cancele-a antes ou nossa equipe cancela junto com a exclusão.</p> : null}
      <Field label="Quer contar o motivo? (opcional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#dc2626]" />
        <span>Entendo que a exclusão não pode ser desfeita.</span>
      </label>
      <ErrorNote message={error} />
    </Modal>
  );
}
