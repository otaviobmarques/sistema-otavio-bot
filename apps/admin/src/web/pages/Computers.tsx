import { AlertTriangle, Check, MoveRight, Power, RefreshCw, ServerCog, Settings2, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { canWrite, useMe } from "../App.tsx";
import { api, useApi } from "../api.ts";
import { brl, date, type Tone } from "../format.ts";
import { Badge, Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Modal, Mono, PageHeader, Select, Stat, StatusBadge, Table, td, Textarea, useToast } from "../ui.tsx";

type Provider = "hetzner" | "hostinger" | "contabo";

interface Machine {
  id: string; provider: Provider; organization_id: string | null; organization_name: string | null; purpose: "home" | "computer"; status: string;
  status_reason: string | null; plan_ref: string | null; region: string | null; ipv4: string | null; hostname: string | null; monthly_cost_cents: number | null;
  setup_fee_cents: number | null; provider_vm_id: string | null; provider_order_id: string | null; provider_subscription_id: string | null;
  provider_state: string | null; auto_renew: boolean | null; expires_at: string | null; ordered_at: string | null; ready_at: string | null;
  last_error: string | null; created_at: string; node_name: string | null; online: boolean; agent_version: string | null;
  instance_id: string | null; waiting_move_instance_id: string | null;
}

interface Settings {
  auto_purchase: boolean; provider: Provider;
  hetzner_server_type: string; hetzner_location: string; hetzner_image: string | null; hetzner_monthly_cost_cents: number;
  hostinger_item_id: string; hostinger_template_id: number | null; hostinger_data_center_id: number | null; hostinger_monthly_cost_cents: number; hostinger_setup_fee_cents: number;
  contabo_product_id: string; contabo_region: string; contabo_image_id: string | null; contabo_monthly_cost_cents: number; contabo_setup_fee_cents: number;
}

interface Data {
  settings: Settings;
  configured: Record<Provider, boolean>;
  addonPriceCents: number;
  machines: Machine[];
}

const PROVIDER: Record<Provider, string> = { hetzner: "Hetzner Cloud", hostinger: "Hostinger", contabo: "Contabo" };
const STATUS: Record<string, [string, Tone]> = {
  awaiting_approval: ["Aguardando aprovação", "amber"], requested: ["Aprovado", "cyan"], ordering: ["Comprando", "cyan"], provisioning: ["Instalando", "cyan"],
  running: ["No ar", "green"], release_pending: ["Encerrar no provedor", "amber"], released: ["Renovação desligada", "slate"], canceled: ["Descartado", "slate"],
  stopped: ["Parado", "slate"], failed: ["Falha", "red"], deleted: ["Apagado", "slate"],
};
const LIVE = new Set(["requested", "ordering", "provisioning", "running", "release_pending", "stopped", "failed"]);

type Dialog = { kind: "discard" | "release" | "move"; machine: Machine } | { kind: "settings" } | null;

export function ComputersPage() {
  const { me } = useMe();
  const writable = canWrite(me);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Data>("/api/computers");
  const [dialog, setDialog] = useState<Dialog>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote message={error} />;

  const call = async (path: string, done: string) => {
    try {
      await api(path, { method: "POST", body: {} });
      toast(done);
      reload();
    } catch (reason) {
      toast((reason as Error).message, "error");
    }
  };
  const approve = (machine: Machine) => {
    const cost = machine.monthly_cost_cents ? ` (${brl(machine.monthly_cost_cents)}/mês${machine.setup_fee_cents ? ` + ${brl(machine.setup_fee_cents)} de instalação` : ""})` : "";
    if (!window.confirm(`Contratar uma VPS na ${PROVIDER[machine.provider]} para ${machine.organization_name ?? "este cliente"}${cost}? Isso gasta dinheiro.`)) return;
    void call(`/api/computers/${machine.id}/approve`, "Aprovado: a compra sai em instantes");
  };
  const live = data.machines.filter((m) => LIVE.has(m.status));
  const pending = data.machines.filter((m) => m.status === "awaiting_approval");
  const cost = live.reduce((sum, m) => sum + Number(m.monthly_cost_cents ?? 0), 0);
  const s = data.settings;

  return (
    <div className="space-y-6">
      <PageHeader title="Computadores (VPS)"
        subtitle={<>Um computador próprio por unidade do plano (Profissional 1, Empresa 2) ou do adicional de {brl(data.addonPriceCents)}/mês. O primeiro recebe o ArkoBot do cliente; o acesso continua por <Mono>{"<slug>.arkobot.com.br"}</Mono>, repassado pela VPS compartilhada.</>}
        actions={me.role === "owner" ? <Button variant="secondary" onClick={() => setDialog({ kind: "settings" })}><Settings2 className="h-4 w-4" /> Configurações</Button> : null} />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Compra automática" value={s.auto_purchase ? "Ligada" : "Desligada"} hint={s.auto_purchase ? "só o computador do ArkoBot; extras pedem aprovação" : "cada compra espera “Aprovar e contratar”"} tone={s.auto_purchase ? "alert" : "default"} />
        <Stat label="Provedor das próximas" value={PROVIDER[s.provider]} hint={data.configured[s.provider] ? "credenciais no ambiente" : "sem credenciais no ambiente"} tone={data.configured[s.provider] ? "default" : "alert"} />
        <Stat label="Em uso" value={live.length} hint={`${pending.length} aguardando aprovação`} />
        <Stat label="Custo por mês" value={brl(cost)} hint={`receita de referência: ${brl(live.length * data.addonPriceCents)}`} />
      </div>
      {s.provider === "contabo" ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Contabo: os preços mais baixos exigem contrato de 12 ou 24 meses e alguns produtos cobram taxa de instalação. Não combina com a revenda mensal; a instalação pode levar horas.</span>
        </div>
      ) : null}

      <Card title={<span className="flex items-center gap-2"><ServerCog className="h-4 w-4" /> Máquinas</span>} padded={false}>
        <Table head={["Cliente", "Uso", "Provedor", "Situação", "Endereço", "Custo", "Renovação", ""]} empty="Nenhum computador ainda: eles aparecem quando um cliente com direito paga a fatura.">
          {data.machines.map((m) => (
            <tr key={m.id} className={["canceled", "deleted", "released"].includes(m.status) ? "opacity-50" : undefined}>
              <td className={td}>{m.organization_id ? <Link to={`/clientes/${m.organization_id}`} className="font-medium hover:underline">{m.organization_name}</Link> : "—"}
                <div className="text-xs text-slate-500">desde {date(m.created_at)}</div></td>
              <td className={td}>{m.purpose === "home" ? "ArkoBot do cliente" : "Computador extra"}
                {m.waiting_move_instance_id ? <div className="text-xs text-amber-700">dados a copiar do servidor compartilhado</div> : null}</td>
              <td className={td}>{PROVIDER[m.provider]}<div className="text-xs text-slate-500">{m.plan_ref ?? "—"}{m.region ? ` · ${m.region}` : ""}</div></td>
              <td className={td}><StatusBadge map={STATUS} value={m.status} /> {m.node_name ? (m.online ? <Badge tone="green">agente online</Badge> : <Badge tone="red">agente sem contato</Badge>) : null}
                {m.status_reason ? <div className="text-xs text-slate-500">{m.status_reason}</div> : null}
                {m.last_error ? <div className="max-w-xs truncate text-xs text-red-600" title={m.last_error}>{m.last_error}</div> : null}</td>
              <td className={td}>{m.ipv4 ? <Mono>{m.ipv4}</Mono> : "—"}<div className="text-xs text-slate-500">{m.provider_vm_id ? `VM ${m.provider_vm_id}` : ""}{m.provider_state ? ` · ${m.provider_state}` : ""}</div></td>
              <td className={`${td} tabular`}>{m.monthly_cost_cents !== null ? `${brl(m.monthly_cost_cents)}/mês` : "—"}{m.setup_fee_cents ? <div className="text-xs text-slate-500">+ {brl(m.setup_fee_cents)} instalação</div> : null}</td>
              <td className={td}>{m.provider === "hetzner" ? <span className="text-xs text-slate-500">por hora</span> : m.auto_renew === false ? `até ${date(m.expires_at)}` : m.auto_renew ? "automática" : "—"}</td>
              <td className={`${td} whitespace-nowrap text-right`}>
                {writable && m.status === "awaiting_approval" ? <Button size="sm" onClick={() => approve(m)}><Check className="h-3.5 w-3.5" /> Aprovar e contratar</Button> : null}
                {writable && ["awaiting_approval", "requested", "failed"].includes(m.status) ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "discard", machine: m })}><XCircle className="h-3.5 w-3.5" /> Descartar</Button> : null}
                {writable && m.status === "failed" ? <Button size="sm" variant="ghost" onClick={() => call(`/api/computers/${m.id}/retry`, "Tentando de novo")}><RefreshCw className="h-3.5 w-3.5" /> Tentar de novo</Button> : null}
                {writable && m.waiting_move_instance_id ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "move", machine: m })}><MoveRight className="h-3.5 w-3.5" /> Mover ArkoBot</Button> : null}
                {me.role === "owner" && ["running", "release_pending", "provisioning", "failed", "stopped"].includes(m.status) && m.provider_vm_id
                  ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "release", machine: m })}><Power className="h-3.5 w-3.5" /> Encerrar</Button> : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {dialog?.kind === "settings" ? <SettingsDialog data={data} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} /> : null}
      {dialog && dialog.kind !== "settings" ? <ActionDialog kind={dialog.kind} machine={dialog.machine} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} /> : null}
    </div>
  );
}

const ACTION_COPY = {
  discard: { title: "Descartar pedido", button: "Descartar",
    text: "Nada foi comprado para este pedido. Se o cliente continuar com direito, a próxima verificação cria um pedido novo." },
  release: { title: "Encerrar no provedor", button: "Encerrar",
    text: "Hostinger: a renovação é desligada e a VPS some, com os dados, ao fim do período pago. Contabo: cancelada ao fim do período. Hetzner: a VPS é apagada agora, com o disco, e a cobrança por hora para. Só funciona com o ArkoBot do cliente fora desta VPS." },
  move: { title: "Mover o ArkoBot para o computador próprio", button: "Já copiei os dados: mover",
    text: "Antes, copie o volume arkoinst-<id>-data do servidor compartilhado para esta VPS (README, “Mover uma instância com dados”). Ao mover, o servidor compartilhado remove o contêiner (o volume fica lá) e esta VPS sobe a instância com o volume copiado." },
} as const;

function ActionDialog({ kind, machine, onClose, onDone }: { kind: keyof typeof ACTION_COPY; machine: Machine; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = ACTION_COPY[kind];
  const submit = async () => {
    setBusy(true);
    try {
      const path = kind === "move" ? `/api/computers/instances/${machine.waiting_move_instance_id}/move` : `/api/computers/${machine.id}/${kind}`;
      await api(path, { method: "POST", body: { reason, ...(kind === "discard" ? {} : { confirm: true }) } });
      toast("Feito");
      onDone();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${copy.title}: ${machine.organization_name ?? machine.id.slice(0, 8)}`} open onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant={kind === "release" ? "danger" : "primary"} busy={busy} disabled={reason.trim().length < 5} onClick={submit}>
        {kind === "release" ? <Trash2 className="h-3.5 w-3.5" /> : null}{copy.button}</Button></>}>
      <p className="text-sm text-slate-600">{copy.text}</p>
      <Field label="Motivo (vai para a auditoria)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
    </Modal>
  );
}

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const toCents = (text: string) => Math.round(Number(text.replace(/\./g, "").replace(",", ".")) * 100) || 0;

function SettingsDialog({ data, onClose, onDone }: { data: Data; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const s = data.settings;
  const [f, setF] = useState({
    autoPurchase: s.auto_purchase, provider: s.provider,
    hetznerServerType: s.hetzner_server_type, hetznerLocation: s.hetzner_location, hetznerImage: s.hetzner_image ?? "", hetznerCost: reais(s.hetzner_monthly_cost_cents),
    hostingerItemId: s.hostinger_item_id, hostingerTemplateId: s.hostinger_template_id ? String(s.hostinger_template_id) : "",
    hostingerDataCenterId: s.hostinger_data_center_id ? String(s.hostinger_data_center_id) : "", hostingerCost: reais(s.hostinger_monthly_cost_cents),
    hostingerFee: reais(s.hostinger_setup_fee_cents), contaboProductId: s.contabo_product_id, contaboRegion: s.contabo_region, contaboImageId: s.contabo_image_id ?? "",
    contaboCost: reais(s.contabo_monthly_cost_cents), contaboFee: reais(s.contabo_setup_fee_cents),
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });
  const save = async () => {
    if (f.autoPurchase && !s.auto_purchase && !window.confirm("Ligar a compra automática? Cada cliente pago com direito a computador vai gerar uma compra sem aprovação.")) return;
    setBusy(true);
    try {
      await api("/api/computers/settings", { method: "PUT", body: {
        autoPurchase: f.autoPurchase, provider: f.provider,
        hetznerServerType: f.hetznerServerType, hetznerLocation: f.hetznerLocation, hetznerImage: f.hetznerImage.trim() || null, hetznerMonthlyCostCents: toCents(f.hetznerCost),
        hostingerItemId: f.hostingerItemId, hostingerTemplateId: f.hostingerTemplateId ? Number(f.hostingerTemplateId) : null,
        hostingerDataCenterId: f.hostingerDataCenterId ? Number(f.hostingerDataCenterId) : null, hostingerMonthlyCostCents: toCents(f.hostingerCost),
        hostingerSetupFeeCents: toCents(f.hostingerFee), contaboProductId: f.contaboProductId, contaboRegion: f.contaboRegion,
        contaboImageId: f.contaboImageId.trim() || null, contaboMonthlyCostCents: toCents(f.contaboCost), contaboSetupFeeCents: toCents(f.contaboFee),
      } });
      toast("Configurações salvas");
      onDone();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const missing = (p: Provider) => (data.configured[p] ? "" : " (sem credenciais no ambiente)");
  return (
    <Modal title="Configurações de compra" open wide onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={save}>Salvar</Button></>}>
      <Checkbox label="Compra automática de VPS" checked={f.autoPurchase} onChange={(value) => setF({ ...f, autoPurchase: value })}
        hint="Desligada: cada compra vira um pedido em “Aguardando aprovação”. Ligada: só o computador do ArkoBot é comprado sozinho; os extras sempre pedem aprovação." />
      <Field label="Provedor das próximas compras" hint="As credenciais ficam só no ambiente: HETZNER_API_TOKEN, HOSTINGER_API_TOKEN ou CONTABO_CLIENT_ID/SECRET + CONTABO_API_USER/PASSWORD.">
        <Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as Provider })}>
          {(["hetzner", "hostinger", "contabo"] as const).map((p) => <option key={p} value={p}>{PROVIDER[p]}{missing(p)}</option>)}
        </Select>
      </Field>
      {f.provider === "hetzner" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tipo de servidor" hint="cx23 (2 vCPU, 4 GB) só na Europa; em ash/hil use cpx21"><Input value={f.hetznerServerType} onChange={set("hetznerServerType")} /></Field>
          <Field label="Localização" hint="fsn1, nbg1, hel1, ash, hil"><Input value={f.hetznerLocation} onChange={set("hetznerLocation")} /></Field>
          <Field label="Imagem" hint="vazio: ubuntu-24.04"><Input value={f.hetznerImage} onChange={set("hetznerImage")} /></Field>
          <Field label="Custo por mês (R$)" hint="o preço é em euro: converta e inclua o IPv4"><Input value={f.hetznerCost} onChange={set("hetznerCost")} /></Field>
        </div>
      ) : null}
      {f.provider === "hostinger" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Item do catálogo"><Input value={f.hostingerItemId} onChange={set("hostingerItemId")} /></Field>
          <Field label="Modelo (template id)" hint="vazio: Ubuntu 24.04 with Docker"><Input value={f.hostingerTemplateId} onChange={set("hostingerTemplateId")} /></Field>
          <Field label="Data center (id)" hint="vazio: Brasil, se houver"><Input value={f.hostingerDataCenterId} onChange={set("hostingerDataCenterId")} /></Field>
          <Field label="Custo por mês (R$)"><Input value={f.hostingerCost} onChange={set("hostingerCost")} /></Field>
          <Field label="Taxa de instalação (R$)"><Input value={f.hostingerFee} onChange={set("hostingerFee")} /></Field>
        </div>
      ) : null}
      {f.provider === "contabo" ? (
        <>
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Os planos mais baratos da Contabo exigem 12 ou 24 meses: não servem para revender por mês.</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Produto (productId)"><Input value={f.contaboProductId} onChange={set("contaboProductId")} /></Field>
            <Field label="Região" hint="EU, US-central, US-east, US-west, SIN, UK, AUS, JPN"><Input value={f.contaboRegion} onChange={set("contaboRegion")} /></Field>
            <Field label="Imagem (imageId)" hint="vazio: Ubuntu 24.04 padrão"><Input value={f.contaboImageId} onChange={set("contaboImageId")} /></Field>
            <Field label="Custo por mês (R$)"><Input value={f.contaboCost} onChange={set("contaboCost")} /></Field>
            <Field label="Taxa de instalação (R$)"><Input value={f.contaboFee} onChange={set("contaboFee")} /></Field>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
