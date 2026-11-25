import { CheckCircle2, Copy, KeyRound, Landmark, Plus, RefreshCw, ShieldAlert, Star, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, useApi } from "../api.ts";
import { canWrite, useMe } from "../App.tsx";
import { BILLING_TYPE, brl, date, dateTime, daysSince, documentFormat, EVENT_STATUS, ORG_STATUS, PAYMENT_STATUS, SUB_STATUS } from "../format.ts";
import {
  Badge, Button, Card, Checkbox, Empty, ErrorNote, Field, Input, Loading, Modal, Mono, PageHeader, Select, StatusBadge, Table, Tabs, td, useToast,
} from "../ui.tsx";

type Tab = "contas" | "assinaturas" | "pagamentos" | "inadimplentes" | "eventos";

export function BillingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) || "contas";
  return (
    <>
      <PageHeader title="Cobrança" subtitle="Contas Asaas, assinaturas, pagamentos e a régua de inadimplência." />
      <Tabs<Tab> value={tab} onChange={(value) => setParams({ aba: value })} items={[
        { value: "contas", label: "Contas Asaas" }, { value: "assinaturas", label: "Assinaturas" }, { value: "pagamentos", label: "Pagamentos" },
        { value: "inadimplentes", label: "Inadimplentes" }, { value: "eventos", label: "Webhooks e fila" },
      ]} />
      {tab === "contas" ? <Accounts /> : tab === "assinaturas" ? <Subscriptions /> : tab === "pagamentos" ? <Payments /> : tab === "inadimplentes" ? <Delinquent /> : <Events />}
    </>
  );
}

interface Account {
  id: string; label: string; holderType: "pf" | "pj"; holderName: string; holderDocument: string; environment: "sandbox" | "production";
  apiKeyFingerprint: string; canIssueNfse: boolean; activeForNew: boolean; enabled: boolean; lastTestedAt: string | null; lastTestOk: boolean | null;
  lastTestMessage: string | null; webhookUrl: string;
}

function CopyButton({ value }: { value: string }) {
  const toast = useToast();
  return (
    <button onClick={() => navigator.clipboard.writeText(value).then(() => toast("Copiado"))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Copiar">
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function Accounts() {
  const { me } = useMe();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ accounts: Account[] }>("/api/billing/accounts");
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ url: string; token: string } | null>(null);
  const [replacing, setReplacing] = useState<Account | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const writable = canWrite(me);
  if (loading && !data) return <Loading />;
  const act = async (key: string, path: string, success: string, after?: (result: any) => void) => {
    setBusy(key);
    try {
      const result = await api(path, { body: {} });
      if (after) after(result);
      else toast(success);
      reload();
    } catch (reason) {
      toast((reason as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <ErrorNote message={error} />
      <div className="mb-4 flex items-center justify-between">
        <p className="max-w-2xl text-sm text-slate-600">Novas assinaturas e cobranças saem pela conta <b>ativa para novos</b>. As antigas continuam na conta em que foram criadas, então dá para trocar a pessoa física pelo CNPJ da Domma sem migrar ninguém.</p>
        {writable ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Cadastrar conta</Button> : null}
      </div>
      {data?.accounts.length === 0 ? (
        <Card><Empty icon={<Landmark className="h-6 w-6" />} title="Nenhuma conta Asaas">Cadastre a conta de pessoa física no ambiente sandbox primeiro, teste, configure o webhook no painel do Asaas e só depois a de produção.</Empty></Card>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {data?.accounts.map((account) => (
          <section key={account.id} className={`rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${account.activeForNew ? "border-cyan-ink/40 ring-2 ring-cyan-brand/25" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{account.label}</h3>
                  {account.activeForNew ? <Badge tone="cyan"><Star className="h-3 w-3" /> ativa para novos</Badge> : null}
                  {!account.enabled ? <Badge>desativada</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">{account.holderName} · {account.holderType === "pf" ? "CPF" : "CNPJ"} {documentFormat(account.holderDocument)}</p>
              </div>
              <div className="flex gap-1.5">
                <Badge tone={account.holderType === "pf" ? "violet" : "slate"}>{account.holderType === "pf" ? "Pessoa física" : "Pessoa jurídica"}</Badge>
                <Badge tone={account.environment === "production" ? "green" : "amber"}>{account.environment === "production" ? "Produção" : "Sandbox"}</Badge>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Chave de API (impressão digital)</dt><dd><Mono>{account.apiKeyFingerprint}</Mono></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Emite NFS-e</dt><dd>{account.canIssueNfse ? "Sim" : "Não"}</dd></div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Último teste</dt>
                <dd className="text-right">{account.lastTestedAt ? <span className={account.lastTestOk ? "text-emerald-700" : "text-red-600"}>{account.lastTestMessage}</span> : <span className="text-slate-400">nunca testada</span>}</dd>
              </div>
              <div>
                <dt className="mb-1 text-slate-500">URL do webhook (cole no painel do Asaas)</dt>
                <dd className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5"><code className="flex-1 truncate font-mono text-xs">{account.webhookUrl}</code><CopyButton value={account.webhookUrl} /></dd>
              </div>
            </dl>
            {writable ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                <Button size="sm" variant="secondary" busy={busy === `t${account.id}`} onClick={() => act(`t${account.id}`, `/api/billing/accounts/${account.id}/test`, "", (r) => toast(r.message, r.ok ? "ok" : "error"))}><Zap className="h-3.5 w-3.5" /> Testar conexão</Button>
                {!account.activeForNew && account.enabled ? <Button size="sm" variant="secondary" busy={busy === `a${account.id}`} onClick={() => act(`a${account.id}`, `/api/billing/accounts/${account.id}/activate`, "Agora as novas cobranças saem por esta conta")}><CheckCircle2 className="h-3.5 w-3.5" /> Usar para novos</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => setReplacing(account)}><KeyRound className="h-3.5 w-3.5" /> Trocar chave</Button>
                <Button size="sm" variant="ghost" busy={busy === `w${account.id}`} onClick={() => act(`w${account.id}`, `/api/billing/accounts/${account.id}/webhook-token`, "", (r) => setSecret({ url: r.webhookUrl, token: r.webhookToken }))}><RefreshCw className="h-3.5 w-3.5" /> Novo token</Button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
      {creating ? <NewAccount onClose={() => setCreating(false)} onCreated={(result) => { setCreating(false); setSecret(result); reload(); }} /> : null}
      {replacing ? <ReplaceKey account={replacing} onClose={() => setReplacing(null)} onDone={() => { setReplacing(null); reload(); }} /> : null}
      <Modal title="Configure o webhook no Asaas" open={secret !== null} onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>Já configurei</Button>}>
        <p className="text-sm text-slate-600">No painel do Asaas: <b>Integrações → Webhooks → Adicionar</b>. Use a URL abaixo, versão da API v3, ative a fila e marque os eventos de <b>Cobranças</b> e <b>Assinaturas</b>. No campo <b>Token de autenticação</b>, cole o token.</p>
        <Field label="URL"><div className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5"><code className="flex-1 break-all font-mono text-xs">{secret?.url}</code><CopyButton value={secret?.url ?? ""} /></div></Field>
        <Field label="Token de autenticação" hint="Mostrado só agora. Ele fica cifrado no banco e não aparece de novo; se perder, gere outro.">
          <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5"><code className="flex-1 break-all font-mono text-xs">{secret?.token}</code><CopyButton value={secret?.token ?? ""} /></div>
        </Field>
      </Modal>
    </>
  );
}

function NewAccount({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: { url: string; token: string }) => void }) {
  const [f, setF] = useState({ label: "Asaas – pessoa física (sandbox)", holderType: "pf", holderName: "", holderDocument: "", environment: "sandbox", apiKey: "", canIssueNfse: false, activeForNew: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ account: Account; webhookToken: string }>("/api/billing/accounts", { body: f });
      onCreated({ url: result.account.webhookUrl, token: result.webhookToken });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Cadastrar conta Asaas" open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Cadastrar</Button></>}>
      <Field label="Nome da conta"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Titular"><Select value={f.holderType} onChange={(e) => setF({ ...f, holderType: e.target.value })}><option value="pf">Pessoa física (CPF)</option><option value="pj">Pessoa jurídica (CNPJ)</option></Select></Field>
        <Field label="Ambiente"><Select value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}><option value="sandbox">Sandbox (testes)</option><option value="production">Produção</option></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome do titular"><Input value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} /></Field>
        <Field label={f.holderType === "pf" ? "CPF" : "CNPJ"}><Input value={f.holderDocument} onChange={(e) => setF({ ...f, holderDocument: e.target.value })} /></Field>
      </div>
      <Field label="Chave de API" hint="Começa com $aact_. Fica cifrada (AES-256-GCM) e nunca é exibida de novo.">
        <Input type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} className="font-mono" />
      </Field>
      <div className="space-y-2 rounded-xl bg-slate-50 p-4">
        <Checkbox label="Usar para novas assinaturas e cobranças" checked={f.activeForNew} onChange={(activeForNew) => setF({ ...f, activeForNew })} hint="Substitui a conta ativa atual para novos clientes" />
        <Checkbox label="Esta conta emite NFS-e" checked={f.canIssueNfse} onChange={(canIssueNfse) => setF({ ...f, canIssueNfse })} hint="Normalmente só a conta com CNPJ" />
      </div>
      <ErrorNote message={error} />
    </Modal>
  );
}

function ReplaceKey({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/billing/accounts/${account.id}/api-key`, { body: { apiKey } });
      toast("Chave trocada. Teste a conexão.");
      onDone();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Trocar chave — ${account.label}`} open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Trocar</Button></>}>
      <Field label="Nova chave de API"><Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="font-mono" /></Field>
      <ErrorNote message={error} />
    </Modal>
  );
}

function Subscriptions() {
  const [status, setStatus] = useState("");
  const { data, error } = useApi<{ subscriptions: any[] }>(`/api/billing/subscriptions?status=${status}`);
  return (
    <Card padded={false} title="Assinaturas" actions={
      <Select className="h-8 w-48 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todas</option>{Object.entries(SUB_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
      </Select>}>
      <ErrorNote message={error} />
      <Table head={["Cliente", "Plano", "Valor", "Forma", "Situação", "Próx. vencimento", "Conta"]} empty="Nenhuma assinatura.">
        {(data?.subscriptions ?? []).map((row) => (
          <tr key={row.id} className="hover:bg-slate-50">
            <td className={td}><Link className="font-medium hover:text-cyan-ink" to={`/clientes/${row.organization_id}`}>{row.organization_name}</Link></td>
            <td className={td}>{row.plan_name} {row.courtesy ? <Badge tone="violet">cortesia</Badge> : null}</td>
            <td className={`${td} tabular`}>{row.courtesy ? "sem cobrança" : brl(row.total_cents)}</td>
            <td className={td}>{row.billing_type ? BILLING_TYPE[row.billing_type] : "—"}</td>
            <td className={td}><StatusBadge map={SUB_STATUS} value={row.status} /></td>
            <td className={td}>{row.status === "canceled" ? "—" : date(row.next_due_date)}</td>
            <td className={`${td} text-slate-600`}>{row.billing_account_label ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Payments() {
  const [status, setStatus] = useState("");
  const { data, error } = useApi<{ payments: any[] }>(`/api/billing/payments?status=${status}`);
  return (
    <Card padded={false} title="Pagamentos" actions={
      <Select className="h-8 w-48 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todos</option>{Object.entries(PAYMENT_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
      </Select>}>
      <ErrorNote message={error} />
      <Table head={["Cliente", "Tipo", "Valor", "Forma", "Status", "Vencimento", "Pago em", "Asaas"]} empty="Nenhum pagamento.">
        {(data?.payments ?? []).map((row) => (
          <tr key={row.id} className="hover:bg-slate-50">
            <td className={td}><Link className="font-medium hover:text-cyan-ink" to={`/clientes/${row.organization_id}`}>{row.organization_name}</Link></td>
            <td className={td}>{row.kind === "credit_purchase" ? "Créditos" : "Assinatura"}</td>
            <td className={`${td} tabular`}>{brl(row.value_cents)}</td>
            <td className={td}>{row.billing_type ? BILLING_TYPE[row.billing_type] ?? row.billing_type : "—"}</td>
            <td className={td}><StatusBadge map={PAYMENT_STATUS} value={row.status} /></td>
            <td className={td}>{date(row.due_date)}</td>
            <td className={`${td} whitespace-nowrap`}>{dateTime(row.paid_at)}</td>
            <td className={td}><Mono>{row.provider_payment_id}</Mono></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Delinquent() {
  const { data, error } = useApi<{ delinquent: any[]; policy: { suspendAfterDays: number; cancelAfterDays: number } }>("/api/billing/delinquent");
  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ["1. Vencida", "A assinatura fica em atraso e as instâncias são marcadas com problema de pagamento.", "red"],
          [`2. ${data?.policy.suspendAfterDays ?? 7} dias`, "O cliente é suspenso por cobrança. Pagar reativa sozinho.", "amber"],
          [`3. ${data?.policy.cancelAfterDays ?? 30} dias`, "Assinatura cancelada aqui e no Asaas; cliente cancelado.", "slate"],
        ].map(([title, text, tone]) => (
          <div key={title} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <ShieldAlert className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "red" ? "text-red-500" : tone === "amber" ? "text-amber-500" : "text-slate-400"}`} />
            <div><div className="font-semibold">{title}</div><div className="text-sm text-slate-600">{text}</div></div>
          </div>
        ))}
      </div>
      <ErrorNote message={error} />
      <Card padded={false} title="Clientes inadimplentes">
        <Table head={["Cliente", "Plano", "Mensalidade", "Em aberto", "Atraso", "Assinatura", "Cliente"]} empty="Ninguém em atraso.">
          {(data?.delinquent ?? []).map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className={td}><Link className="font-medium hover:text-cyan-ink" to={`/clientes/${row.organization_id}`}>{row.organization_name}</Link></td>
              <td className={td}>{row.plan_name}</td>
              <td className={`${td} tabular`}>{brl(row.total_cents)}</td>
              <td className={`${td} tabular font-semibold text-red-600`}>{brl(row.overdue_cents)}</td>
              <td className={td}>{daysSince(row.past_due_since) ?? "—"} dias</td>
              <td className={td}><StatusBadge map={SUB_STATUS} value={row.status} /></td>
              <td className={td}><StatusBadge map={ORG_STATUS} value={row.organization_status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function Events() {
  const { me } = useMe();
  const toast = useToast();
  const { data, error, reload } = useApi<{ events: any[]; jobs: any[] }>("/api/billing/events");
  const retry = async (id: string) => {
    try {
      await api(`/api/billing/events/${id}/retry`, { body: {} });
      toast("Evento colocado na fila de novo");
      reload();
    } catch (reason) {
      toast((reason as Error).message, "error");
    }
  };
  return (
    <div className="space-y-6">
      <ErrorNote message={error} />
      <Card padded={false} title="Webhooks recebidos" actions={<span className="text-xs text-slate-500">Gravados brutos e deduplicados pelo id do evento</span>}>
        <Table head={["Recebido", "Evento", "Id no Asaas", "Conta", "Situação", "Resultado", ""]} empty="Nenhum webhook recebido ainda.">
          {(data?.events ?? []).map((row) => (
            <tr key={row.id}>
              <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.received_at)}</td>
              <td className={td}><Mono>{row.event_type}</Mono></td>
              <td className={td}><Mono>{row.event_id}</Mono></td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>{row.billing_account_label}</td>
              <td className={td}><StatusBadge map={EVENT_STATUS} value={row.status} /></td>
              <td className={`${td} text-slate-600`}>{row.error ?? "—"}</td>
              <td className={td}>{canWrite(me) && (row.status === "received" || row.status === "failed") ? <Button size="sm" variant="ghost" onClick={() => retry(row.id)}>Reprocessar</Button> : null}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card padded={false} title="Fila de tarefas (pendentes e com falha)">
        <Table head={["#", "Tipo", "Situação", "Tentativas", "Próxima", "Último erro"]} empty="Fila vazia.">
          {(data?.jobs ?? []).map((row) => (
            <tr key={row.id}>
              <td className={td}>{row.id}</td>
              <td className={td}><Mono>{row.type}</Mono></td>
              <td className={td}><Badge tone={row.status === "failed" ? "red" : "cyan"}>{row.status === "failed" ? "falhou" : "na fila"}</Badge></td>
              <td className={td}>{row.attempts}</td>
              <td className={`${td} whitespace-nowrap`}>{dateTime(row.run_at)}</td>
              <td className={`${td} text-slate-600`}>{row.last_error ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
