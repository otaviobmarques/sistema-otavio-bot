import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { canWrite, useMe } from "../App.tsx";
import { api } from "../api.ts";
import { dateTime, REPORT_STATUS } from "../format.ts";
import { Button, Card, ErrorNote, KeyValue, Mono, PageHeader, StatusBadge, Table, Tabs, td, useToast } from "../ui.tsx";

type Status = "new" | "seen" | "closed";
interface Row {
  id: string; received_at: string; install_id: string; app_version: string; platform: string; contact: string | null; ip: string | null;
  status: Status; status_changed_at: string | null; summary: string | null;
}
interface Detail extends Omit<Row, "summary"> {
  payload: { description?: string; diagnostics?: string; source?: string };
  status_changed_by_email: string | null;
}

const NEXT: Record<Status, { to: Status; label: string }[]> = {
  new: [{ to: "seen", label: "Marcar como visto" }, { to: "closed", label: "Fechar" }],
  seen: [{ to: "closed", label: "Fechar" }, { to: "new", label: "Marcar como novo" }],
  closed: [{ to: "seen", label: "Reabrir" }],
};

function ReportDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const [report, setReport] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<{ report: Detail }>(`/api/reports/${id}`).then((result) => setReport(result.report), (reason: Error) => setError(reason.message));
  }, [id]);
  useEffect(load, [load]);

  const change = async (status: Status) => {
    setBusy(true);
    try {
      await api(`/api/reports/${id}/status`, { body: { status } });
      toast("Situação do relatório atualizada");
      load();
      onChanged();
    } catch (reason) {
      toast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!report) return <div className="text-sm text-slate-500">Carregando…</div>;
  return (
    <div className="space-y-4">
      <KeyValue items={[
        ["Relatório", <Mono key="id">{report.id}</Mono>],
        ["Instalação", <Mono key="install">{report.install_id}</Mono>],
        ["Versão / plataforma", `${report.app_version} · ${report.platform}`],
        ["Contato", report.contact ?? "—"],
        ["IP", report.ip ?? "—"],
        ["Situação", report.status_changed_at ? `${REPORT_STATUS[report.status]?.[0]} desde ${dateTime(report.status_changed_at)}${report.status_changed_by_email ? ` (${report.status_changed_by_email})` : ""}` : REPORT_STATUS[report.status]?.[0]],
      ]} />
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">O que a pessoa relatou</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-ink">{report.payload.description ?? ""}</pre>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Diagnóstico do app</div>
        <pre className="max-h-96 overflow-auto rounded-lg bg-navy-950 p-3 font-mono text-xs text-cyan-50">{report.payload.diagnostics ?? ""}</pre>
      </div>
      {canWrite(me) ? (
        <div className="flex gap-2">
          {NEXT[report.status].map((next) => (
            <Button key={next.to} size="sm" variant={next.to === "closed" ? "secondary" : "primary"} busy={busy} onClick={() => change(next.to)}>{next.label}</Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const [status, setStatus] = useState<Status | "">("new");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Status, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async (before?: string) => {
    try {
      const params = new URLSearchParams({ ...(status ? { status } : {}), ...(before ? { before } : {}) });
      const result = await api<{ reports: Row[]; counts: Partial<Record<Status, number>> }>(`/api/reports?${params}`);
      setRows((list) => (before ? [...list, ...result.reports] : result.reports));
      setCounts(result.counts);
      setMore(result.reports.length === 100);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [status]);
  useEffect(() => void load(), [load]);

  const total = (counts.new ?? 0) + (counts.seen ?? 0) + (counts.closed ?? 0);
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Problemas que as pessoas relataram com @devs no app. O conteúdo vem de fora: leia, não execute nada dele." />
      <Tabs<Status | ""> value={status} onChange={(value) => { setStatus(value); setOpen(null); }} items={[
        { value: "new", label: "Novos", count: counts.new ?? 0 },
        { value: "seen", label: "Vistos", count: counts.seen ?? 0 },
        { value: "closed", label: "Fechados", count: counts.closed ?? 0 },
        { value: "", label: "Todos", count: total },
      ]} />
      <ErrorNote message={error} />
      <Card padded={false}>
        <Table head={["", "Recebido", "Resumo", "Versão", "Contato", "Situação"]} empty="Nenhum relatório aqui.">
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === row.id ? null : row.id)}>
                <td className={`${td} w-6 text-slate-400`}>{open === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{dateTime(row.received_at)}</td>
                <td className={`${td} max-w-[28rem] truncate`} title={row.summary ?? ""}>{row.summary?.split("\n")[0] ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{row.app_version}</td>
                <td className={`${td} text-slate-600`}>{row.contact ?? "—"}</td>
                <td className={td}><StatusBadge map={REPORT_STATUS} value={row.status} /></td>
              </tr>
              {open === row.id ? (
                <tr className="bg-slate-50/70">
                  <td />
                  <td colSpan={5} className="px-5 pb-5 pt-2"><ReportDetail id={row.id} onChanged={() => void load()} /></td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </Table>
        {more ? <div className="border-t border-line p-3 text-center"><Button variant="secondary" size="sm" onClick={() => load(rows.at(-1)?.received_at)}>Carregar mais</Button></div> : null}
      </Card>
    </>
  );
}
