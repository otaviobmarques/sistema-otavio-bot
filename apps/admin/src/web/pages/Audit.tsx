import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api.ts";
import { actionLabel, ACTOR, dateTime } from "../format.ts";
import { Badge, Button, Card, ErrorNote, Input, PageHeader, Select, Table, td } from "../ui.tsx";

interface Entry {
  id: number; created_at: string; actor_type: string; actor_label: string | null; action: string; target_type: string | null; target_id: string | null;
  organization_id: string | null; organization_name: string | null; reason: string | null; data: Record<string, unknown>; ip: string | null;
}

const GROUPS: [string, string][] = [
  ["", "Todas as ações"], ["organization.", "Clientes"], ["credits.", "Créditos"], ["subscription.", "Assinaturas"], ["payment.", "Pagamentos"],
  ["plan.", "Planos"], ["billing_account.", "Contas de cobrança"], ["ai_key.", "Chaves de IA"], ["vps_account.", "Hostinger"], ["admin.", "Administradores"], ["bug_report.", "Relatórios"],
];

const ACTOR_TONE: Record<string, "cyan" | "violet" | "slate" | "amber" | "green"> = { admin: "cyan", webhook: "violet", system: "slate", cli: "amber", customer: "green" };

export function AuditPage() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async (before?: number) => {
    try {
      const params = new URLSearchParams({ action, actor, ...(before ? { before: String(before) } : {}) });
      const result = await api<{ entries: Entry[] }>(`/api/audit?${params}`);
      setEntries((list) => (before ? [...list, ...result.entries] : result.entries));
      setMore(result.entries.length === 100);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [action, actor]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <>
      <PageHeader title="Auditoria" subtitle="Registro imutável de tudo que muda: quem fez, quando, de onde e por quê." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="w-56" value={action} onChange={(e) => setAction(e.target.value)}>{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Filtrar por quem fez (e-mail)" value={actor} onChange={(e) => setActor(e.target.value)} />
        </div>
      </div>
      <ErrorNote message={error} />
      <Card padded={false}>
        <Table head={["", "Quando", "Ação", "Cliente", "Quem", "Motivo", "IP"]} empty="Nenhum registro com estes filtros.">
          {entries.map((entry) => (
            <Fragment key={entry.id}>
              <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === entry.id ? null : entry.id)}>
                <td className={`${td} w-6 text-slate-400`}>{open === entry.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(entry.created_at)}</td>
                <td className={`${td} whitespace-nowrap`}><span className="font-medium">{actionLabel(entry.action)}</span></td>
                <td className={td}>{entry.organization_id ? <Link onClick={(e) => e.stopPropagation()} to={`/clientes/${entry.organization_id}`} className="text-cyan-ink hover:underline">{entry.organization_name}</Link> : <span className="text-slate-400">—</span>}</td>
                <td className={`${td} whitespace-nowrap`}><Badge tone={ACTOR_TONE[entry.actor_type]}>{ACTOR[entry.actor_type]}</Badge> <span className="text-slate-600">{entry.actor_label}</span></td>
                <td className={`${td} max-w-[14rem] truncate text-slate-600`} title={entry.reason ?? ""}>{entry.reason ?? "—"}</td>
                <td className={`${td} font-mono text-xs text-slate-500`}>{entry.ip ?? ""}</td>
              </tr>
              {open === entry.id ? (
                <tr className="bg-slate-50/70">
                  <td />
                  <td colSpan={6} className="px-5 pb-4">
                    <div className="text-xs text-slate-500">{entry.action} · {entry.target_type} {entry.target_id}</div>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-navy-950 p-3 font-mono text-xs text-cyan-50">{JSON.stringify(entry.data, null, 2)}</pre>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </Table>
        {more ? <div className="border-t border-line p-3 text-center"><Button variant="secondary" size="sm" onClick={() => load(entries.at(-1)?.id)}>Carregar mais</Button></div> : null}
      </Card>
    </>
  );
}
