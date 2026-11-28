// Backups and server moves on the Instances page (src/backups): the last backup, the list with "Fazer backup agora" and
// a download link, and "Mudar de servidor" (the data goes with it, through a backup).
import { useState } from "react";
import { api, useApi } from "../api.ts";
import { dateTime, type Tone } from "../format.ts";
import { Badge, Button, ErrorNote, Field, Loading, Modal, Select, StatusBadge, Table, td, Textarea, useToast } from "../ui.tsx";

export interface BackupFields {
  id: string; slug: string; node_id: string | null; relocating_to_node_id: string | null; relocating_to_node_name: string | null;
  last_backup_at: string | null; last_backup_bytes: number | string | null;
}

const size = (bytes: number | string | null) => {
  if (bytes === null) return "—";
  const value = Number(bytes);
  if (value < 1024 ** 2) return `${(value / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${(value / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
};

export function BackupCell({ instance, configured }: { instance: BackupFields; configured: boolean }) {
  return (
    <>
      {instance.relocating_to_node_id ? <div><Badge tone="amber">mudando para {instance.relocating_to_node_name ?? "outro servidor"}</Badge></div> : null}
      {instance.last_backup_at
        ? <div className="whitespace-nowrap text-xs text-slate-600">{dateTime(instance.last_backup_at)} · {size(instance.last_backup_bytes)}</div>
        : <span className="text-xs text-slate-400">{configured ? "nenhum ainda" : "não configurado"}</span>}
    </>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  pending: ["Na fila", "slate"], uploading: ["Enviando", "cyan"], done: ["Pronto", "green"], failed: ["Falhou", "red"], deleted: ["Apagado", "slate"],
};
const KIND: Record<string, string> = { scheduled: "diário", manual: "manual", move: "mudança" };

interface BackupItem { id: string; kind: string; status: string; bytes: number | null; error: string | null; createdAt: string; finishedAt: string | null }

export function BackupsDialog({ instance, owner, writable, onClose }: { instance: BackupFields; owner: boolean; writable: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ configured: boolean; backups: BackupItem[] }>(`/api/instances/${instance.id}/backups`);
  const [busy, setBusy] = useState(false);
  const backupNow = async () => {
    setBusy(true);
    try {
      await api(`/api/instances/${instance.id}/backups`, { method: "POST", body: {} });
      toast(`${instance.slug}: backup na fila; o servidor começa em alguns segundos`);
      reload();
    } catch (reason) {
      toast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const download = async (backup: BackupItem) => {
    try {
      const { url } = await api<{ url: string }>(`/api/instances/${instance.id}/backups/${backup.id}/download`, { method: "POST", body: {} });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      toast((reason as Error).message, "error");
    }
  };
  return (
    <Modal title={`Backups — ${instance.slug}`} open onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button>{writable && data?.configured ? <Button busy={busy} onClick={backupNow}>Fazer backup agora</Button> : null}</>}>
      {loading && !data ? <Loading /> : !data ? <ErrorNote message={error} /> : !data.configured ? (
        <p className="text-sm text-slate-600">Os backups ainda não estão ligados: defina <b>BACKUP_S3_*</b> nas variáveis do Admin (README, “Backups”).</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">Uma cópia por dia, de madrugada, num armazenamento separado dos servidores. O ArkoBot fica congelado só enquanto os dados são empacotados (segundos).</p>
          <Table head={["Quando", "Tipo", "Situação", "Tamanho", ""]} empty="Nenhum backup ainda.">
            {data.backups.map((backup) => (
              <tr key={backup.id}>
                <td className={`${td} whitespace-nowrap`}>{dateTime(backup.createdAt)}</td>
                <td className={td}>{KIND[backup.kind] ?? backup.kind}</td>
                <td className={td}><StatusBadge map={STATUS} value={backup.status} />{backup.error ? <div className="max-w-xs truncate text-xs text-red-600" title={backup.error}>{backup.error}</div> : null}</td>
                <td className={`${td} tabular`}>{size(backup.bytes)}</td>
                <td className={`${td} text-right`}>{owner && backup.status === "done" ? <Button size="sm" variant="ghost" onClick={() => download(backup)}>Baixar</Button> : null}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Modal>
  );
}

export function RelocateDialog({ instance, nodes, onClose, onDone }: {
  instance: BackupFields; nodes: { id: string; name: string; status: string; online: boolean; kind: string }[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const targets = nodes.filter((node) => node.id !== instance.node_id && node.status !== "offline");
  const [nodeId, setNodeId] = useState(targets.find((node) => node.status === "active")?.id ?? targets[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/instances/${instance.id}/relocate`, { method: "POST", body: { nodeId, reason } });
      toast(`${instance.slug}: mudança começou`);
      onDone();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Mudar de servidor: ${instance.slug}`} open onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button busy={busy} disabled={!nodeId || reason.trim().length < 5} onClick={submit}>Mudar</Button></>}>
      <p className="text-sm text-slate-600">O ArkoBot para, os dados vão para o armazenamento de backup e são restaurados no servidor novo, que então o liga. Leva alguns minutos; o cliente fica fora nesse tempo. Se algo falhar, ele volta a ligar onde estava.</p>
      {targets.length === 0 ? <p className="text-sm text-amber-700">Nenhum outro servidor disponível.</p> : (
        <Field label="Servidor de destino">
          <Select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            {targets.map((node) => <option key={node.id} value={node.id}>{node.name} · {node.kind === "dedicated" ? "dedicado" : "compartilhado"}{node.online ? "" : " (sem contato)"}{node.status === "draining" ? " (esvaziando)" : ""}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Motivo (vai para a auditoria)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
    </Modal>
  );
}
