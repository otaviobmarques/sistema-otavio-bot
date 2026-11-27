// The Instâncias page's sleep and alert bits: "Dormindo" on an instance of a plan that sleeps, and a banner while a
// node has stopped answering or an instance stays broken (the same episodes the operators get by e-mail).
import { AlertTriangle, Moon } from "lucide-react";
import { dateTime } from "../format.ts";
import { Badge } from "../ui.tsx";

interface PowerItem {
  power: "asleep" | "waking" | "awake";
  wake_at: string | null;
  power_busy: string | null;
  power_checked_at: string | null;
  idle_sleep_minutes: number | null;
  decommissioned_at: string | null;
}

/** Fixed codes the instance gives for staying awake (server/cloud-power.ts), and ours. */
const BUSY: Record<string, string> = {
  turn: "bot respondendo", run: "rotina rodando", handoff: "tarefa entre bots", "live-call": "chamada ao vivo", computer: "computador ligado",
  maintenance: "manutenção", "recent-activity": "uso recente", "recent-work": "acabou de trabalhar", "just-woke": "acabou de acordar",
  "due-soon": "rotina em breve", browser: "página aberta", "imagem-antiga": "imagem sem contagem de abas", "sem-resposta": "não respondeu",
};

export function PowerCell({ instance }: { instance: PowerItem }) {
  if (instance.decommissioned_at || !instance.idle_sleep_minutes) return null;
  if (instance.power === "asleep") {
    return (
      <div className="mt-1">
        <Badge tone="violet"><Moon className="h-3 w-3" /> Dormindo</Badge>
        <div className="text-xs text-slate-500">{instance.wake_at ? `acorda ${dateTime(instance.wake_at)} (rotina)` : "acorda no próximo acesso"}</div>
      </div>
    );
  }
  if (instance.power === "waking") return <div className="mt-1"><Badge tone="cyan">Acordando…</Badge></div>;
  const busy = instance.power_busy?.split(",").map((code) => BUSY[code] ?? code).join(", ");
  return (
    <div className="text-xs text-slate-500" title={instance.power_checked_at ? `verificado ${dateTime(instance.power_checked_at)}` : undefined}>
      dorme após {instance.idle_sleep_minutes} min sem uso{busy ? ` · acordada: ${busy}` : ""}
    </div>
  );
}

interface AlertNode { id: string; name: string; status: string; online: boolean; last_seen_at: string | null; down_alerted_at: string | null }
interface AlertInstance { id: string; slug: string; decommissioned_at: string | null; unhealthy_since: string | null; unhealthy_alerted_at: string | null }

export function HealthAlerts({ nodes, instances }: { nodes: AlertNode[]; instances: AlertInstance[] }) {
  const down = nodes.filter((node) => node.status === "active" && node.last_seen_at && !node.online);
  const broken = instances.filter((instance) => !instance.decommissioned_at && instance.unhealthy_alerted_at);
  if (!down.length && !broken.length) return null;
  return (
    <div className="space-y-1 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Atenção</div>
      {down.map((node) => (
        <p key={node.id}>Servidor <b>{node.name}</b> sem contato desde {dateTime(node.last_seen_at)}{node.down_alerted_at ? " — aviso enviado por e-mail" : ""}.</p>
      ))}
      {broken.map((instance) => (
        <p key={instance.id}>Instância <b>{instance.slug}</b> com erro desde {dateTime(instance.unhealthy_since)} — aviso enviado por e-mail.</p>
      ))}
    </div>
  );
}
