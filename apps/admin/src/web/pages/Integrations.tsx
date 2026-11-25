import { BrainCircuit, KeyRound, Landmark, Lock, Plus, Server, Zap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api, useApi } from "../api.ts";
import { canWrite, useMe } from "../App.tsx";
import { AI_PROVIDER, dateTime } from "../format.ts";
import { Badge, Button, Card, Checkbox, Empty, ErrorNote, Field, Input, Loading, Modal, Mono, PageHeader, Select, Table, td, useToast } from "../ui.tsx";

interface AiKey { id: string; provider: string; label: string; base_url: string | null; api_key_fingerprint: string; enabled: boolean; priority: number; last_tested_at: string | null; last_test_ok: boolean | null; last_test_message: string | null; rotated_at: string | null }
interface VpsAccount { id: string; label: string; api_token_fingerprint: string; enabled: boolean; last_tested_at: string | null; last_test_ok: boolean | null; last_test_message: string | null }
interface BillingAccount { id: string; label: string; environment: string; active_for_new: boolean; enabled: boolean; last_test_ok: boolean | null; api_key_fingerprint: string }

function TestResult({ at, ok, message }: { at: string | null; ok: boolean | null; message: string | null }) {
  if (!at) return <span className="text-slate-400">nunca testada</span>;
  return <span className={ok ? "text-emerald-700" : "text-red-600"} title={dateTime(at)}>{message}</span>;
}

export function IntegrationsPage() {
  const { me } = useMe();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ aiKeys: AiKey[]; vpsAccounts: VpsAccount[]; billingAccounts: BillingAccount[] }>("/api/integrations");
  const [aiDialog, setAiDialog] = useState<AiKey | "new" | null>(null);
  const [vpsDialog, setVpsDialog] = useState<VpsAccount | "new" | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;
  const writable = canWrite(me);
  const test = async (path: string, id: string) => {
    setTesting(id);
    try {
      const result = await api<{ ok: boolean; message: string }>(path, { body: {} });
      toast(result.message, result.ok ? "ok" : "error");
      reload();
    } catch (reason) {
      toast((reason as Error).message, "error");
    } finally {
      setTesting(null);
    }
  };
  return (
    <>
      <PageHeader title="Integrações" subtitle="Chaves dos serviços que o Admin usa. Aqui só se grava, troca e testa: o valor nunca volta para a tela." />
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-soft px-5 py-3 text-sm text-navy-800">
        <Lock className="h-4 w-4 shrink-0 text-cyan-ink" />
        <p>Cada segredo é cifrado com AES-256-GCM pela chave <Mono>ADMIN_ENCRYPTION_KEY</Mono> antes de ir para o banco. A tela mostra só uma impressão digital (os 12 primeiros caracteres do SHA-256) para diferenciar as chaves.</p>
      </div>

      <Card title={<span className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-cyan-ink" /> Provedores de IA</span>} padded={false}
        actions={writable ? <Button size="sm" onClick={() => setAiDialog("new")}><Plus className="h-3.5 w-3.5" /> Adicionar chave</Button> : null}>
        {data.aiKeys.length === 0 ? (
          <Empty icon={<KeyRound className="h-6 w-6" />} title="Nenhuma chave de IA">O gateway de IA (próxima parte) usa estas chaves, por ordem de prioridade, para atender os clientes com os créditos ArkoBot.</Empty>
        ) : (
          <Table head={["Provedor", "Nome", "Impressão digital", "Prioridade", "Situação", "Último teste", ""]}>
            {data.aiKeys.map((key) => (
              <tr key={key.id}>
                <td className={td}>{AI_PROVIDER[key.provider] ?? key.provider}</td>
                <td className={td}><div className="font-medium">{key.label}</div>{key.base_url ? <div className="text-xs text-slate-500">{key.base_url}</div> : null}</td>
                <td className={td}><Mono>{key.api_key_fingerprint}</Mono></td>
                <td className={`${td} tabular`}>{key.priority}</td>
                <td className={td}>{key.enabled ? <Badge tone="green">ativa</Badge> : <Badge>desativada</Badge>}</td>
                <td className={`${td} text-sm`}><TestResult at={key.last_tested_at} ok={key.last_test_ok} message={key.last_test_message} /></td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  {writable ? <>
                    <Button size="sm" variant="ghost" busy={testing === key.id} onClick={() => test(`/api/integrations/ai-keys/${key.id}/test`, key.id)}><Zap className="h-3.5 w-3.5" /> Testar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAiDialog(key)}>Editar</Button>
                  </> : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-cyan-ink" /> Asaas</span>} actions={<Link to="/cobranca" className="text-xs font-medium text-cyan-ink hover:underline">Gerenciar em Cobrança</Link>}>
          {data.billingAccounts.length === 0 ? <p className="text-sm text-slate-500">Nenhuma conta cadastrada.</p> : (
            <ul className="space-y-2.5 text-sm">
              {data.billingAccounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{account.label}</span>
                  <span className="flex items-center gap-1.5">
                    <Mono>{account.api_key_fingerprint}</Mono>
                    <Badge tone={account.environment === "production" ? "green" : "amber"}>{account.environment === "production" ? "produção" : "sandbox"}</Badge>
                    {account.active_for_new ? <Badge tone="cyan">para novos</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Server className="h-4 w-4 text-cyan-ink" /> Hostinger (VPS)</span>}
          actions={writable ? <Button size="sm" variant="secondary" onClick={() => setVpsDialog("new")}><Plus className="h-3.5 w-3.5" /> Adicionar token</Button> : null}>
          {data.vpsAccounts.length === 0 ? <p className="text-sm text-slate-500">Nenhum token cadastrado. Os computadores (VPS) adicionais chegam numa próxima parte, pela interface <Mono>VpsProvider</Mono>.</p> : (
            <ul className="space-y-3 text-sm">
              {data.vpsAccounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3">
                  <span><span className="font-medium">{account.label}</span> <Mono>{account.api_token_fingerprint}</Mono><span className="block text-xs"><TestResult at={account.last_tested_at} ok={account.last_test_ok} message={account.last_test_message} /></span></span>
                  {writable ? <span className="whitespace-nowrap">
                    <Button size="sm" variant="ghost" busy={testing === account.id} onClick={() => test(`/api/integrations/vps-accounts/${account.id}/test`, account.id)}><Zap className="h-3.5 w-3.5" /> Testar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setVpsDialog(account)}>Editar</Button>
                  </span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {aiDialog ? <AiKeyDialog current={aiDialog === "new" ? null : aiDialog} onClose={() => setAiDialog(null)} onSaved={() => { setAiDialog(null); reload(); }} /> : null}
      {vpsDialog ? <VpsDialog current={vpsDialog === "new" ? null : vpsDialog} onClose={() => setVpsDialog(null)} onSaved={() => { setVpsDialog(null); reload(); }} /> : null}
    </>
  );
}

function AiKeyDialog({ current, onClose, onSaved }: { current: AiKey | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ provider: current?.provider ?? "anthropic", label: current?.label ?? "", apiKey: "", baseUrl: current?.base_url ?? "", priority: String(current?.priority ?? 100), enabled: current?.enabled ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (current) {
        await api(`/api/integrations/ai-keys/${current.id}`, { method: "PUT", body: { label: f.label, enabled: f.enabled, priority: Number(f.priority), ...(f.apiKey ? { apiKey: f.apiKey } : {}) } });
      } else {
        await api("/api/integrations/ai-keys", { body: { provider: f.provider, label: f.label, apiKey: f.apiKey, baseUrl: f.baseUrl || null, priority: Number(f.priority) } });
      }
      toast(current ? "Chave atualizada" : "Chave cadastrada");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!current) return;
    try {
      await api(`/api/integrations/ai-keys/${current.id}`, { method: "DELETE" });
      toast("Chave excluída");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  return (
    <Modal title={current ? `Editar ${current.label}` : "Adicionar chave de IA"} open onClose={onClose} footer={<>
      {current ? <Button variant="ghost" className="mr-auto text-red-600" onClick={remove}>Excluir</Button> : null}
      <Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Salvar</Button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Provedor"><Select disabled={Boolean(current)} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{Object.entries(AI_PROVIDER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Prioridade" hint="Menor é usada primeiro"><Input inputMode="numeric" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} /></Field>
      </div>
      <Field label="Nome"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Anthropic – conta principal" /></Field>
      {!current && (f.provider === "other" || f.provider === "openai") ? <Field label="URL base (opcional)" hint="Só para provedores compatíveis com a API da OpenAI"><Input value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="https://…" /></Field> : null}
      <Field label={current ? "Nova chave (deixe vazio para manter)" : "Chave de API"} hint="Cifrada antes de gravar; não é exibida depois.">
        <Input type="password" autoComplete="off" className="font-mono" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} />
      </Field>
      {current ? <Checkbox label="Ativa" checked={f.enabled} onChange={(enabled) => setF({ ...f, enabled })} /> : null}
      <ErrorNote message={error} />
    </Modal>
  );
}

function VpsDialog({ current, onClose, onSaved }: { current: VpsAccount | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ label: current?.label ?? "Hostinger", apiToken: "", enabled: current?.enabled ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      if (current) await api(`/api/integrations/vps-accounts/${current.id}`, { method: "PUT", body: { label: f.label, enabled: f.enabled, ...(f.apiToken ? { apiToken: f.apiToken } : {}) } });
      else await api("/api/integrations/vps-accounts", { body: { label: f.label, apiToken: f.apiToken } });
      toast("Token salvo");
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={current ? "Editar token Hostinger" : "Adicionar token Hostinger"} open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Salvar</Button></>}>
      <Field label="Nome"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <Field label={current ? "Novo token (deixe vazio para manter)" : "Token da API"} hint="hPanel → Perfil → API"><Input type="password" autoComplete="off" className="font-mono" value={f.apiToken} onChange={(e) => setF({ ...f, apiToken: e.target.value })} /></Field>
      {current ? <Checkbox label="Ativo" checked={f.enabled} onChange={(enabled) => setF({ ...f, enabled })} /> : null}
      <ErrorNote message={error} />
    </Modal>
  );
}
