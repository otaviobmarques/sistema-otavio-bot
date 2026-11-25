import { ArrowLeft, Ban, Boxes, Coins, Play, QrCode, RotateCcw, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { api, useApi } from "../api.ts";
import { canWrite, useMe } from "../App.tsx";
import {
  actionLabel, ACTOR, BILLING_TYPE, brl, date, dateTime, documentFormat, INSTANCE_STATE, int, LEDGER_KIND, ORG_STATUS, PAYMENT_STATUS, SUB_STATUS,
} from "../format.ts";
import {
  Badge, Button, Card, Empty, ErrorNote, Field, Input, KeyValue, Loading, Modal, Mono, Select, StatusBadge, Table, Tabs, td, Textarea, useToast,
} from "../ui.tsx";

interface Detail {
  client: { id: string; name: string; slug: string; document_type: string; document: string; status: string; status_reason: string | null; status_reason_code: string | null; billing_email: string | null; phone: string | null; created_at: string };
  members: { id: string; email: string; name: string; phone: string | null; role: string }[];
  subscription: null | {
    id: string; status: string; plan_name: string; plan_code: string; plan_free: boolean; billing_type: string | null; total_cents: number; price_cents: number;
    credits_per_month: number; provider_subscription_id: string | null; next_due_date: string | null; current_period_start: string | null;
    current_period_end: string | null; past_due_since: string | null; canceled_at: string | null; cancel_reason: string | null;
  };
  addons: { addon_id: string; quantity: number; unit_price_cents: number; name: string; code: string }[];
  wallet: { plan_balance: number; extra_balance: number };
  ledger: { id: number; created_at: string; bucket: string; kind: string; amount: number; balance_after: number; reason: string | null; admin_email: string | null }[];
  payments: { id: string; kind: string; status: string; billing_type: string | null; value_cents: number; credits: number; due_date: string | null; paid_at: string | null; invoice_url: string | null; billing_account_label: string }[];
  instances: { id: string; slug: string; machine_id: string; mode: string; state: string; state_reason: string | null }[];
  audit: { id: number; created_at: string; actor_type: string; actor_label: string | null; action: string; reason: string | null }[];
  terms: { document: string; version: string; accepted_at: string; ip: string; email: string }[];
}

interface PlansData {
  plans: { id: string; name: string; price_cents: number; free: boolean; active: boolean; credits_per_month: number }[];
  addons: { id: string; name: string; price_cents: number; unit: string; active: boolean }[];
}

type Section = "ledger" | "payments" | "audit" | "terms";
type Dialog = null | "suspend" | "reactivate" | "cancel" | "credits" | "charge" | "subscribe" | "unsubscribe";

const MODE: Record<string, string> = { dedicated: "Dedicada", shared_limited: "Compartilhada (limitada)", desktop: "No PC do cliente" };
const ROLE: Record<string, string> ={ owner: "Dono", admin: "Admin", member: "Membro" };
const REASON: Record<string, string> = { manual: "manual", billing: "cobrança", chargeback: "chargeback", subscription_ended: "assinatura encerrada" };
const TERMS: Record<string, string> = { terms: "Termos de uso", privacy: "Política de privacidade", dpa: "Acordo de dados (DPA)" };

export function ClientDetailPage() {
  const { id } = useParams();
  const { me } = useMe();
  const { data, error, loading, reload } = useApi<Detail>(`/api/clients/${id}`);
  const [section, setSection] = useState<Section>("ledger");
  const [dialog, setDialog] = useState<Dialog>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const { client, subscription, wallet } = data;
  const writable = canWrite(me);
  const live = subscription && subscription.status !== "canceled" ? subscription : null;
  const close = () => setDialog(null);
  const done = () => {
    setDialog(null);
    reload();
  };

  return (
    <>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Clientes</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight">{client.name}</h1>
            <StatusBadge map={ORG_STATUS} value={client.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {client.document_type.toUpperCase()} {documentFormat(client.document)} · cliente desde {date(client.created_at)} · <Mono>{client.slug}</Mono>
          </p>
          {client.status !== "active" && client.status_reason ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
              Motivo ({REASON[client.status_reason_code ?? ""] ?? "—"}): {client.status_reason}
            </p>
          ) : null}
        </div>
        {writable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog("credits")}><Coins className="h-4 w-4" /> Ajustar créditos</Button>
            <Button variant="secondary" onClick={() => setDialog("charge")} disabled={client.status === "canceled"}><QrCode className="h-4 w-4" /> Cobrar créditos</Button>
            {client.status === "active" ? <Button variant="secondary" onClick={() => setDialog("suspend")}><Ban className="h-4 w-4" /> Suspender</Button> : null}
            {client.status !== "active" ? <Button variant="accent" onClick={() => setDialog("reactivate")}><RotateCcw className="h-4 w-4" /> Reativar</Button> : null}
            {client.status !== "canceled" ? <Button variant="ghost" onClick={() => setDialog("cancel")}><XCircle className="h-4 w-4" /> Cancelar cliente</Button> : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Assinatura" className="lg:col-span-2" actions={writable ? (live
          ? <Button size="sm" variant="ghost" onClick={() => setDialog("unsubscribe")}>Cancelar assinatura</Button>
          : <Button size="sm" onClick={() => setDialog("subscribe")} disabled={client.status === "canceled"}><Play className="h-3.5 w-3.5" /> Iniciar assinatura</Button>) : null}>
          {subscription ? (
            <div className="grid gap-6 md:grid-cols-2">
              <KeyValue items={[
                ["Plano", <>{subscription.plan_name} {subscription.plan_free ? <Badge tone="cyan">grátis</Badge> : null}</>],
                ["Situação", <StatusBadge map={SUB_STATUS} value={subscription.status} />],
                ["Valor mensal", <span className="tabular">{brl(subscription.total_cents)}</span>],
                ["Forma", subscription.billing_type ? BILLING_TYPE[subscription.billing_type] : "—"],
                ["Cota mensal", `${int(subscription.credits_per_month)} créditos`],
              ]} />
              <KeyValue items={[
                ["Próximo vencimento", date(subscription.next_due_date)],
                ["Período atual", subscription.current_period_start ? `${date(subscription.current_period_start)} a ${date(subscription.current_period_end)}` : "—"],
                ["Em atraso desde", subscription.past_due_since ? dateTime(subscription.past_due_since) : "—"],
                ["Asaas", subscription.provider_subscription_id ? <Mono>{subscription.provider_subscription_id}</Mono> : "—"],
                ...(subscription.canceled_at ? [["Cancelada em", `${dateTime(subscription.canceled_at)} — ${subscription.cancel_reason ?? ""}`] as [string, ReactNode]] : []),
              ]} />
              {live && !live.plan_free ? <AddonsEditor detail={data} writable={writable} onChanged={reload} /> : null}
            </div>
          ) : (
            <Empty title="Sem assinatura">Inicie uma assinatura: o cliente é criado no Asaas com o CPF/CNPJ e a cobrança sai pela conta ativa para novos.</Empty>
          )}
        </Card>

        <Card title="Créditos ArkoBot">
          <div className="font-display text-4xl font-bold tabular">{int(Number(wallet.plan_balance) + Number(wallet.extra_balance))}</div>
          <div className="mt-1 text-sm text-slate-500">≈ {brl(Number(wallet.plan_balance) + Number(wallet.extra_balance))} em uso de IA</div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Do plano (expira)</div><div className="mt-1 font-semibold tabular">{int(wallet.plan_balance)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Avulsos</div><div className="mt-1 font-semibold tabular">{int(wallet.extra_balance)}</div></div>
          </div>
          {live && Number(live.credits_per_month) > 0 ? (
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                <span>Cota do plano restante</span>
                <span className="tabular">{int(wallet.plan_balance)} de {int(live.credits_per_month)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-cyan-ink" style={{ width: `${Math.min(100, (Number(wallet.plan_balance) / Number(live.credits_per_month)) * 100)}%` }} />
              </div>
              <p className="mt-3 text-xs text-slate-500">Uso com a própria conta ou chave de IA do cliente não passa pelo gateway e não gasta créditos.</p>
            </div>
          ) : null}
        </Card>

        <Card title="Pessoas" padded={false}>
          <ul className="divide-y divide-line">
            {data.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span><span className="block font-medium">{member.name || member.email}</span><span className="text-xs text-slate-500">{member.email}</span></span>
                <Badge tone={member.role === "owner" ? "cyan" : "slate"}>{ROLE[member.role]}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Instâncias" className="lg:col-span-2" padded={false}>
          {data.instances.length === 0 ? (
            <Empty icon={<Boxes className="h-6 w-6" />} title="Nenhuma instância ainda">O provisionamento automático chega na próxima parte. Os estados (preparando, pronta, parada, problema de pagamento) já seguem a cobrança.</Empty>
          ) : (
            <Table head={["Instância", "Modo", "Estado"]}>
              {data.instances.map((instance) => (
                <tr key={instance.id}>
                  <td className={td}><div className="font-medium">{instance.slug}</div><div className="text-xs text-slate-500"><Mono>{instance.machine_id}</Mono></div></td>
                  <td className={td}>{MODE[instance.mode] ?? instance.mode}</td>
                  <td className={td}><StatusBadge map={INSTANCE_STATE} value={instance.state} />{instance.state_reason ? <span className="ml-2 text-xs text-slate-500">{instance.state_reason}</span> : null}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-8">
        <Tabs<Section> value={section} onChange={setSection} items={[
          { value: "ledger", label: "Extrato de créditos", count: data.ledger.length },
          { value: "payments", label: "Pagamentos", count: data.payments.length },
          { value: "audit", label: "Auditoria", count: data.audit.length },
          { value: "terms", label: "Aceites de termos", count: data.terms.length },
        ]} />
        <Card padded={false}>
          {section === "ledger" ? (
            <Table head={["Data", "Lançamento", "Saldo", "Valor", "Saldo depois", "Motivo"]} empty="Nenhum lançamento.">
              {data.ledger.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.created_at)}</td>
                  <td className={td}>{LEDGER_KIND[row.kind] ?? row.kind}</td>
                  <td className={td}><Badge tone={row.bucket === "plan" ? "cyan" : "violet"}>{row.bucket === "plan" ? "plano" : "avulso"}</Badge></td>
                  <td className={`${td} tabular font-semibold ${Number(row.amount) < 0 ? "text-red-600" : "text-emerald-700"}`}>{Number(row.amount) > 0 ? "+" : ""}{int(row.amount)}</td>
                  <td className={`${td} tabular`}>{int(row.balance_after)}</td>
                  <td className={`${td} text-slate-600`}>{row.reason}{row.admin_email ? <span className="text-xs text-slate-400"> · {row.admin_email}</span> : null}</td>
                </tr>
              ))}
            </Table>
          ) : section === "payments" ? (
            <Table head={["Vencimento", "Tipo", "Valor", "Forma", "Status", "Pago em", "Conta", ""]} empty="Nenhum pagamento.">
              {data.payments.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} whitespace-nowrap`}>{date(row.due_date)}</td>
                  <td className={td}>{row.kind === "credit_purchase" ? `Créditos (${int(row.credits)})` : "Assinatura"}</td>
                  <td className={`${td} tabular`}>{brl(row.value_cents)}</td>
                  <td className={td}>{row.billing_type ? BILLING_TYPE[row.billing_type] ?? row.billing_type : "—"}</td>
                  <td className={td}><StatusBadge map={PAYMENT_STATUS} value={row.status} /></td>
                  <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.paid_at)}</td>
                  <td className={`${td} text-slate-600`}>{row.billing_account_label}</td>
                  <td className={td}>{row.invoice_url ? <a href={row.invoice_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-cyan-ink hover:underline">fatura</a> : null}</td>
                </tr>
              ))}
            </Table>
          ) : section === "audit" ? (
            <Table head={["Data", "Ação", "Quem", "Motivo"]} empty="Nada registrado.">
              {data.audit.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.created_at)}</td>
                  <td className={td}>{actionLabel(row.action)}</td>
                  <td className={`${td} text-slate-600`}>{row.actor_label ?? ACTOR[row.actor_type]}</td>
                  <td className={`${td} text-slate-600`}>{row.reason ?? "—"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={["Documento", "Versão", "Pessoa", "Aceito em", "IP"]} empty="Nenhum aceite registrado. O portal do cliente grava versão, data e IP quando a pessoa aceita os termos.">
              {data.terms.map((row, i) => (
                <tr key={i}>
                  <td className={td}>{TERMS[row.document] ?? row.document}</td>
                  <td className={td}><Mono>{row.version}</Mono></td>
                  <td className={td}>{row.email}</td>
                  <td className={`${td} whitespace-nowrap`}>{dateTime(row.accepted_at)}</td>
                  <td className={td}><Mono>{row.ip}</Mono></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <StatusDialog kind={dialog === "suspend" || dialog === "reactivate" || dialog === "cancel" ? dialog : null} clientId={client.id} onClose={close} onDone={done} />
      <CreditsDialog open={dialog === "credits"} clientId={client.id} onClose={close} onDone={done} />
      <ChargeDialog open={dialog === "charge"} clientId={client.id} onClose={close} onDone={reload} />
      <SubscribeDialog open={dialog === "subscribe"} clientId={client.id} onClose={close} onDone={done} />
      <UnsubscribeDialog open={dialog === "unsubscribe"} clientId={client.id} onClose={close} onDone={done} />
    </>
  );
}

function useSubmit(onDone: () => void, success: string) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api(path, { body });
      toast(success);
      onDone();
      return result;
    } catch (reason) {
      setError((reason as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit, setError };
}

const STATUS_COPY = {
  suspend: { title: "Suspender cliente", action: "suspend", button: "Suspender", text: "As instâncias do cliente param. A suspensão manual não é desfeita por pagamento: só por uma reativação aqui." },
  reactivate: { title: "Reativar cliente", action: "reactivate", button: "Reativar", text: "O cliente volta a ficar ativo e as instâncias voltam a ser preparadas." },
  cancel: { title: "Cancelar cliente", action: "cancel", button: "Cancelar cliente", text: "Encerra o cliente. Cancele também a assinatura no Asaas, se ainda houver." },
} as const;

function StatusDialog({ kind, clientId, onClose, onDone }: { kind: keyof typeof STATUS_COPY | null; clientId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, submit } = useSubmit(() => { setReason(""); onDone(); }, "Situação do cliente atualizada");
  if (!kind) return null;
  const copy = STATUS_COPY[kind];
  return (
    <Modal title={copy.title} open onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Voltar</Button>
      <Button variant={kind === "reactivate" ? "accent" : "danger"} busy={busy} onClick={() => submit(`/api/clients/${clientId}/status`, { action: copy.action, reason })}>{copy.button}</Button>
    </>}>
      <p className="text-sm text-slate-600">{copy.text}</p>
      <Field label="Motivo" hint="Fica na auditoria com o seu nome."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique o motivo" /></Field>
      <ErrorNote message={error} />
    </Modal>
  );
}

function CreditsDialog({ open, clientId, onClose, onDone }: { open: boolean; clientId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ bucket: "extra", direction: "add", amount: "", reason: "" });
  const { busy, error, submit } = useSubmit(() => { setForm({ bucket: "extra", direction: "add", amount: "", reason: "" }); onDone(); }, "Créditos ajustados");
  const amount = Math.round(Number(form.amount.replace(/\D/g, "")) || 0);
  return (
    <Modal title="Ajustar créditos" open={open} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button busy={busy} disabled={!amount} onClick={() => submit(`/api/clients/${clientId}/credits`, { bucket: form.bucket, amount: form.direction === "add" ? amount : -amount, reason: form.reason })}>Lançar</Button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Operação"><Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option value="add">Adicionar</option><option value="remove">Retirar</option></Select></Field>
        <Field label="Saldo"><Select value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })}><option value="extra">Avulsos (não expiram)</option><option value="plan">Do plano (expiram na renovação)</option></Select></Field>
      </div>
      <Field label="Quantidade de créditos" hint={amount ? `= ${brl(amount)} (1 crédito = R$ 0,01)` : "1 crédito = R$ 0,01"}>
        <Input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000" />
      </Field>
      <Field label="Motivo" hint="Obrigatório. Vai para o extrato e para a auditoria."><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex.: compensação por indisponibilidade em 20/11" /></Field>
      <ErrorNote message={error} />
    </Modal>
  );
}

interface ChargeResult { valueCents: number; credits: number; invoiceUrl: string | null; pix: { encodedImage: string; payload: string } | null }

function ChargeDialog({ open, clientId, onClose, onDone }: { open: boolean; clientId: string; onClose: () => void; onDone: () => void }) {
  const [credits, setCredits] = useState("5000");
  const [billingType, setBillingType] = useState("PIX");
  const [result, setResult] = useState<ChargeResult | null>(null);
  const { busy, error, submit } = useSubmit(onDone, "Cobrança gerada no Asaas");
  const amount = Number(credits.replace(/\D/g, "")) || 0;
  const closeAll = () => {
    setResult(null);
    onClose();
  };
  return (
    <Modal title="Cobrança avulsa de créditos" open={open} onClose={closeAll} footer={result ? <Button onClick={closeAll}>Fechar</Button> : <>
      <Button variant="secondary" onClick={closeAll}>Cancelar</Button>
      <Button busy={busy} disabled={amount < 500} onClick={async () => {
        const created = await submit(`/api/clients/${clientId}/credit-charge`, { credits: amount, billingType });
        if (created) setResult(created as ChargeResult);
      }}>Gerar cobrança</Button>
    </>}>
      {result ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">Cobrança de <b>{brl(result.valueCents)}</b> para <b>{int(result.credits)} créditos</b>. Os créditos entram assim que o Asaas confirmar o pagamento.</p>
          {result.pix ? (
            <>
              <img src={`data:image/png;base64,${result.pix.encodedImage}`} alt="QR Code Pix" className="mx-auto h-52 w-52 rounded-xl border border-line" />
              <Field label="Pix copia e cola"><Textarea readOnly value={result.pix.payload} className="font-mono text-xs" onFocus={(e) => e.target.select()} /></Field>
            </>
          ) : null}
          {result.invoiceUrl ? <a href={result.invoiceUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-cyan-ink hover:underline">Abrir fatura no Asaas</a> : null}
        </div>
      ) : (
        <>
          <Field label="Créditos" hint={`Valor: ${brl(amount)} · mínimo 500 créditos`}><Input inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
          <Field label="Forma de pagamento">
            <Select value={billingType} onChange={(e) => setBillingType(e.target.value)}>
              {Object.entries(BILLING_TYPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <ErrorNote message={error} />
        </>
      )}
    </Modal>
  );
}

function SubscribeDialog({ open, clientId, onClose, onDone }: { open: boolean; clientId: string; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<PlansData>(open ? "/api/plans" : null);
  const plans = (data?.plans ?? []).filter((plan) => plan.active);
  const [planId, setPlanId] = useState("");
  const [billingType, setBillingType] = useState("UNDEFINED");
  const [firstDueDate, setFirstDueDate] = useState(new Date().toISOString().slice(0, 10));
  const { busy, error, submit } = useSubmit(onDone, "Assinatura criada");
  const selected = plans.find((plan) => plan.id === (planId || plans[0]?.id));
  return (
    <Modal title="Iniciar assinatura" open={open} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button busy={busy} disabled={!selected} onClick={() => submit(`/api/clients/${clientId}/subscription`, { planId: selected!.id, billingType, firstDueDate })}>Criar assinatura</Button>
    </>}>
      <Field label="Plano">
        <Select value={selected?.id ?? ""} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.free ? "grátis" : `${brl(plan.price_cents)}/mês`} · {int(plan.credits_per_month)} créditos</option>)}
        </Select>
      </Field>
      {selected && !selected.free ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de pagamento">
            <Select value={billingType} onChange={(e) => setBillingType(e.target.value)}>
              {Object.entries(BILLING_TYPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="1º vencimento"><Input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} /></Field>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">Planos pagos são criados no Asaas pela conta marcada como ativa para novos. A assinatura fica “aguardando 1º pagamento” até o webhook confirmar.</p>
      <ErrorNote message={error} />
    </Modal>
  );
}

function UnsubscribeDialog({ open, clientId, onClose, onDone }: { open: boolean; clientId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, submit } = useSubmit(onDone, "Assinatura cancelada");
  return (
    <Modal title="Cancelar assinatura" open={open} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Voltar</Button>
      <Button variant="danger" busy={busy} onClick={() => submit(`/api/clients/${clientId}/subscription/cancel`, { reason })}>Cancelar assinatura</Button>
    </>}>
      <p className="text-sm text-slate-600">A assinatura é cancelada no Asaas (para de gerar cobranças) e aqui. O cliente fica suspenso até iniciar outra.</p>
      <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorNote message={error} />
    </Modal>
  );
}

function AddonsEditor({ detail, writable, onChanged }: { detail: Detail; writable: boolean; onChanged: () => void }) {
  const { data } = useApi<PlansData>("/api/plans");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const addons = (data?.addons ?? []).filter((addon) => addon.active);
  if (!addons.length) return null;
  const change = async (addonId: string, quantity: number) => {
    setBusy(addonId);
    try {
      await api(`/api/clients/${detail.client.id}/subscription/addons`, { body: { addonId, quantity } });
      toast("Adicional atualizado e valor recalculado no Asaas");
      onChanged();
    } catch (reason) {
      toast((reason as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="md:col-span-2 rounded-xl border border-line bg-slate-50/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Adicionais</div>
      {addons.map((addon) => {
        const quantity = detail.addons.find((row) => row.addon_id === addon.id)?.quantity ?? 0;
        return (
          <div key={addon.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span><span className="font-medium">{addon.name}</span> <span className="text-slate-500">· {brl(addon.price_cents)}/mês {addon.unit === "per_bot" ? "por bot" : ""}</span></span>
            <span className="flex items-center gap-2">
              {writable ? <Button size="sm" variant="secondary" disabled={quantity === 0 || busy === addon.id} onClick={() => change(addon.id, quantity - 1)}>−</Button> : null}
              <span className="w-8 text-center font-semibold tabular">{quantity}</span>
              {writable ? <Button size="sm" variant="secondary" disabled={busy === addon.id} onClick={() => change(addon.id, quantity + 1)}>+</Button> : null}
              <span className="w-24 text-right tabular text-slate-600">{brl(quantity * addon.price_cents)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
