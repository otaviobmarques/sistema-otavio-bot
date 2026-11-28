import { ArrowRightLeft, Archive, Boxes, KeyRound, Play, Plus, RefreshCw, ServerCog, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { canWrite, useMe } from "../App.tsx";
import { api, useApi } from "../api.ts";
import { dateTime, INSTANCE_STATE, type Tone } from "../format.ts";
import { HealthAlerts, PowerCell } from "./instance-power.tsx";
import { BackupCell, BackupsDialog, RelocateDialog, type BackupFields } from "./instance-backups.tsx";
import { diskUsageCopy, diskUsageOf } from "../../customer/disk-usage.ts";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Loading, Modal, Mono, PageHeader, StatusBadge, Table, td, Textarea, useToast } from "../ui.tsx";

interface InstanceItem {
  id: string; organization_id: string; organization_name: string; slug: string; public_url: string | null; mode: string; state: string;
  state_reason: string | null; node_id: string | null; node_name: string | null; operator_stopped: boolean; decommissioned_at: string | null;
  observed_state: string | null; observed_health: string | null; observed_error: string | null; observed_at: string | null; ready_at: string | null;
  generation: number; plan_tier_synced: string | null; plan_code: string | null; plan_name: string | null; desired: "running" | "stopped" | "absent";
  disk_used_bytes: number | string | null; disk_quota_bytes: number | string | null; disk_state: string | null; disk_measured_at: string | null;
  power: "asleep" | "waking" | "awake"; sleeping_since: string | null; wake_at: string | null; power_busy: string | null; power_checked_at: string | null;
  idle_sleep_minutes: number | null; unhealthy_since: string | null; unhealthy_alerted_at: string | null;
  relocating_to_node_id: string | null; relocating_to_node_name: string | null; last_backup_at: string | null; last_backup_bytes: number | string | null;
}

interface NodeItem {
  id: string; name: string; kind: string; public_ip: string | null; capacity_instances: number | null; status: string; last_seen_at: string | null;
  agent_version: string | null; last_error: string | null; orphan_containers: number; instances: number; online: boolean;
  down_alerted_at: string | null;
}

interface Data {
  settings: { baseDomain: string; image: string; gatewayUrl: string; backups: boolean };
  instances: InstanceItem[];
  nodes: NodeItem[];
}

const OBSERVED: Record<string, [string, Tone]> = {
  running: ["Rodando", "green"], starting: ["Ligando", "cyan"], stopped: ["Parado", "slate"], absent: ["Sem contêiner", "slate"], error: ["Erro", "red"],
};
const DISK_STATE: Record<string, [string, Tone]> = { ok: ["ok", "green"], warning: ["≥ 80%", "amber"], full: ["cheio", "red"], over: ["acima de 110%", "red"] };

/** Space used against the plan, as the node agent last measured it. */
function DiskCell({ instance }: { instance: InstanceItem }) {
  const disk = diskUsageOf(instance);
  if (!disk) {
    return instance.disk_used_bytes !== null
      ? <span className="tabular text-xs text-slate-600">{(Number(instance.disk_used_bytes) / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB (sem limite)</span>
      : <span className="text-slate-400">—</span>;
  }
  const copy = diskUsageCopy(disk);
  return (
    <>
      <div className="tabular whitespace-nowrap text-xs">{copy.line.replace(" usados", "")} · {copy.percent}%</div>
      <StatusBadge map={DISK_STATE} value={disk.state} />
      <div className="text-xs text-slate-500">{dateTime(disk.measuredAt)}</div>
    </>
  );
}

const NODE_STATUS: Record<string, [string, Tone]> = { active: ["Ativo", "green"], draining: ["Esvaziando", "amber"], offline: ["Desligado", "slate"] };

type Action = { kind: "stop" | "reprovision" | "decommission"; instance: InstanceItem };

export function InstancesPage() {
  const { me } = useMe();
  const writable = canWrite(me);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Data>("/api/instances");
  const [action, setAction] = useState<Action | null>(null);
  const [newNode, setNewNode] = useState(false);
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  const [backups, setBackups] = useState<BackupFields | null>(null);
  const [relocate, setRelocate] = useState<BackupFields | null>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;

  const start = async (instance: InstanceItem) => {
    try {
      await api(`/api/instances/${instance.id}/start`, { method: "POST", body: {} });
      toast(`${instance.slug}: ligando`);
      reload();
    } catch (reason) {
      toast((reason as Error).message, "error");
    }
  };
  const rotate = async (node: NodeItem) => {
    if (!window.confirm(`Gerar um novo token para ${node.name}? O agente para de funcionar até receber o novo.`)) return;
    try {
      const result = await api<{ token: string }>(`/api/instances/nodes/${node.id}/token`, { method: "POST", body: {} });
      setToken({ name: node.name, token: result.token });
    } catch (reason) {
      toast((reason as Error).message, "error");
    }
  };
  const live = data.instances.filter((i) => !i.decommissioned_at);

  return (
    <div className="space-y-6">
      <PageHeader title="Instâncias" subtitle={<>Um ArkoBot por cliente com assinatura ativa, em <Mono>{`<slug>.${data.settings.baseDomain}`}</Mono>. Imagem <Mono>{data.settings.image}</Mono>.</>}
        actions={me.role === "owner" ? <Button onClick={() => setNewNode(true)}><Plus className="h-4 w-4" /> Cadastrar servidor</Button> : null} />

      <HealthAlerts nodes={data.nodes} instances={data.instances} />

      <Card title={<span className="flex items-center gap-2"><ServerCog className="h-4 w-4" /> Servidores</span>} padded={false}>
        {data.nodes.length === 0 ? (
          <Empty icon={<ServerCog className="h-6 w-6" />} title="Nenhum servidor cadastrado">Cadastre a VPS e rode o agente nela (README, “Provisionamento”). Até lá, as instâncias ficam aguardando vaga.</Empty>
        ) : (
          <Table head={["Servidor", "Situação", "Agente", "Instâncias", "Último contato", ""]}>
            {data.nodes.map((node) => (
              <tr key={node.id}>
                <td className={td}><div className="font-medium">{node.name}</div><div className="text-xs text-slate-500">{node.public_ip ?? "—"} · {node.kind === "dedicated" ? "dedicado" : "compartilhado"}</div></td>
                <td className={td}><StatusBadge map={NODE_STATUS} value={node.status} /> {node.online ? <Badge tone="green">online</Badge> : <Badge tone="red">sem contato</Badge>}
                  {node.down_alerted_at ? <div className="text-xs text-red-600">aviso enviado {dateTime(node.down_alerted_at)}</div> : null}</td>
                <td className={td}>{node.agent_version ?? "—"}{node.last_error ? <div className="max-w-xs truncate text-xs text-red-600" title={node.last_error}>{node.last_error}</div> : null}
                  {node.orphan_containers ? <div className="text-xs text-amber-700">{node.orphan_containers} contêiner(es) sem instância</div> : null}</td>
                <td className={`${td} tabular`}>{node.instances}{node.capacity_instances ? ` / ${node.capacity_instances}` : ""}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(node.last_seen_at)}</td>
                <td className={`${td} text-right`}>{me.role === "owner" ? <Button size="sm" variant="ghost" onClick={() => rotate(node)}><KeyRound className="h-3.5 w-3.5" /> Novo token</Button> : null}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Instâncias ({live.length})</span>} padded={false}>
        <Table head={["Cliente", "Endereço", "Plano", "Servidor", "Situação", "No servidor", "Disco", "Backup", ""]} empty="Nenhuma instância ainda: elas nascem sozinhas quando uma assinatura fica ativa.">
          {data.instances.map((instance) => (
            <tr key={instance.id} className={instance.decommissioned_at ? "opacity-50" : undefined}>
              <td className={td}><Link to={`/clientes/${instance.organization_id}`} className="font-medium hover:underline">{instance.organization_name}</Link></td>
              <td className={td}>{instance.public_url ? <a href={instance.public_url} target="_blank" rel="noopener noreferrer" className="text-cyan-ink hover:underline">{instance.slug}</a> : instance.slug}
                <div className="text-xs text-slate-500">geração {instance.generation}{instance.plan_tier_synced ? ` · plano informado: ${instance.plan_tier_synced}` : ""}</div></td>
              <td className={td}>{instance.plan_name ?? "—"}</td>
              <td className={td}>{instance.node_name ?? <span className="text-amber-700">aguardando vaga</span>}</td>
              <td className={td}>
                {instance.decommissioned_at ? <Badge tone="slate">Desativada</Badge> : <StatusBadge map={INSTANCE_STATE} value={instance.state} />}
                {instance.operator_stopped ? <Badge tone="amber">parada pelo operador</Badge> : null}
                <PowerCell instance={instance} />
                {instance.state_reason ? <div className="text-xs text-slate-500">{instance.state_reason}</div> : null}
              </td>
              <td className={td}>
                {instance.observed_state ? <StatusBadge map={OBSERVED} value={instance.observed_state} /> : <span className="text-slate-400">—</span>}
                {instance.observed_health && instance.observed_health !== "none" ? <span className="ml-1 text-xs text-slate-500">{instance.observed_health}</span> : null}
                {instance.observed_error ? <div className="max-w-xs truncate text-xs text-red-600" title={instance.observed_error}>{instance.observed_error}</div> : null}
                <div className="text-xs text-slate-500">{dateTime(instance.observed_at)}</div>
              </td>
              <td className={td}><DiskCell instance={instance} /></td>
              <td className={td}><BackupCell instance={instance} configured={data.settings.backups} /></td>
              <td className={`${td} whitespace-nowrap text-right`}>
                {writable && !instance.decommissioned_at ? (
                  <>
                    {instance.operator_stopped
                      ? <Button size="sm" variant="ghost" onClick={() => start(instance)}><Play className="h-3.5 w-3.5" /> Ligar</Button>
                      : <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "stop", instance })}><Square className="h-3.5 w-3.5" /> Parar</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setBackups(instance)}><Archive className="h-3.5 w-3.5" /> Backups</Button>
                    {data.settings.backups && instance.node_id && !instance.relocating_to_node_id
                      ? <Button size="sm" variant="ghost" onClick={() => setRelocate(instance)}><ArrowRightLeft className="h-3.5 w-3.5" /> Mudar de servidor</Button> : null}
                    <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "reprovision", instance })}><RefreshCw className="h-3.5 w-3.5" /> Reprovisionar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "decommission", instance })}><Trash2 className="h-3.5 w-3.5" /> Desativar</Button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {backups ? <BackupsDialog instance={backups} owner={me.role === "owner"} writable={writable} onClose={() => { setBackups(null); reload(); }} /> : null}
      {relocate ? <RelocateDialog instance={relocate} nodes={data.nodes} onClose={() => setRelocate(null)} onDone={() => { setRelocate(null); reload(); }} /> : null}
      <ActionDialog action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />
      <NodeDialog open={newNode} onClose={() => setNewNode(false)} onCreated={(created) => { setNewNode(false); setToken(created); reload(); }} />
      <Modal title={`Token do agente — ${token?.name ?? ""}`} open={token !== null} onClose={() => setToken(null)} footer={<Button onClick={() => setToken(null)}>Já guardei</Button>}>
        <p className="text-sm text-slate-600">Copie agora: ele <b>não aparece de novo</b>. Na VPS, ponha no <Mono>.env</Mono> do agente (README, “Provisionamento”):</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">ARKO_NODE_TOKEN={token?.token}</pre>
      </Modal>
    </div>
  );
}

const ACTION_COPY = {
  stop: { title: "Parar instância", text: "O contêiner para e fica parado até você ligar de novo, mesmo que a cobrança volte ao normal. Os dados ficam.", button: "Parar" },
  reprovision: { title: "Reprovisionar instância", text: "O agente baixa a imagem de novo e recria o contêiner. Os dados ficam no volume; o cliente fica alguns segundos fora.", button: "Reprovisionar" },
  decommission: { title: "Desativar instância", text: "O contêiner é removido e o token de IA da instância é revogado. O volume com os dados fica no servidor até alguém apagá-lo à mão. Se o cliente continuar com assinatura ativa, ele ganha uma instância nova.", button: "Desativar" },
} as const;

function ActionDialog({ action, onClose, onDone }: { action: Action | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!action) return null;
  const copy = ACTION_COPY[action.kind];
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/instances/${action.instance.id}/${action.kind}`, { method: "POST", body: { reason, ...(action.kind === "decommission" ? { confirm: true } : {}) } });
      toast(`${action.instance.slug}: feito`);
      setReason("");
      onDone();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${copy.title}: ${action.instance.slug}`} open onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant={action.kind === "decommission" ? "danger" : "primary"} busy={busy} disabled={reason.trim().length < 5} onClick={submit}>{copy.button}</Button></>}>
      <p className="text-sm text-slate-600">{copy.text}</p>
      <Field label="Motivo (vai para a auditoria)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
    </Modal>
  );
}

function NodeDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (created: { name: string; token: string }) => void }) {
  const toast = useToast();
  const [name, setName] = useState("vps-hostinger-1");
  const [ip, setIp] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const result = await api<{ node: { name: string }; token: string }>("/api/instances/nodes", {
        method: "POST", body: { name, publicIp: ip.trim() || null, capacityInstances: capacity ? Number(capacity) : null },
      });
      onCreated({ name: result.node.name, token: result.token });
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Cadastrar servidor" open={open} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={submit}>Cadastrar e mostrar o token</Button></>}>
      <Field label="Nome" hint="letras minúsculas, números e hífen"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="IP público"><Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="200.141.20.53" /></Field>
      <Field label="Máximo de instâncias" hint="deixe em branco para não limitar"><Input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} /></Field>
    </Modal>
  );
}
