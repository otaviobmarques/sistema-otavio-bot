import { Building2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, useApi } from "../api.ts";
import { canWrite, useMe } from "../App.tsx";
import { date, documentFormat, int, ORG_STATUS, SUB_STATUS } from "../format.ts";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, StatusBadge, Table, Tabs, td, useToast } from "../ui.tsx";

interface ClientRow {
  id: string; name: string; document_type: string; document: string; status: string; status_reason: string | null; created_at: string;
  subscription_status: string | null; plan_name: string | null; plan_free: boolean | null; courtesy: boolean | null; credits: number; owner_email: string | null;
}

type Filter = "" | "active" | "past_due" | "suspended" | "canceled";

export function ClientsPage() {
  const { me } = useMe();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, error, reload } = useApi<{ clients: ClientRow[]; total: number }>(`/api/clients?q=${encodeURIComponent(debounced)}&status=${filter}`);

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Organizações que contratam o ArkoBot, com CPF ou CNPJ."
        actions={canWrite(me) ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo cliente</Button> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar por nome, e-mail, CPF ou CNPJ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="-mb-5">
          <Tabs<Filter> value={filter} onChange={setFilter} items={[
            { value: "", label: "Todos" }, { value: "active", label: "Ativos" }, { value: "past_due", label: "Em atraso" },
            { value: "suspended", label: "Suspensos" }, { value: "canceled", label: "Cancelados" },
          ]} />
        </div>
      </div>
      <ErrorNote message={error} />
      <Card padded={false}>
        {data && data.clients.length === 0 ? (
          <Empty icon={<Building2 className="h-6 w-6" />} title={debounced || filter ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}>
            {debounced || filter ? "Tente outra busca ou outro filtro." : "Cadastre o primeiro cliente para criar a assinatura e acompanhar os créditos."}
          </Empty>
        ) : (
          <Table head={["Cliente", "Responsável", "Plano", "Assinatura", "Créditos", "Status", "Desde"]}>
            {(data?.clients ?? []).map((row) => (
              <tr key={row.id} onClick={() => navigate(`/clientes/${row.id}`)} className="cursor-pointer hover:bg-slate-50">
                <td className={td}>
                  <div className="font-medium text-ink">{row.name}</div>
                  <div className="text-xs text-slate-500">{row.document_type.toUpperCase()} {documentFormat(row.document)}</div>
                </td>
                <td className={`${td} text-slate-600`}>{row.owner_email ?? "—"}</td>
                <td className={td}>{row.plan_name ? <>{row.plan_name} {row.plan_free ? <Badge tone="cyan">grátis</Badge> : null}{row.courtesy ? <Badge tone="violet">cortesia</Badge> : null}</> : <span className="text-slate-400">sem plano</span>}</td>
                <td className={td}><StatusBadge map={SUB_STATUS} value={row.subscription_status} /></td>
                <td className={`${td} tabular`}>{int(row.credits)}</td>
                <td className={td}><StatusBadge map={ORG_STATUS} value={row.status} /></td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{date(row.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && data.total > data.clients.length ? <div className="border-t border-line px-5 py-3 text-xs text-slate-500">Mostrando {data.clients.length} de {data.total}. Refine a busca para ver os demais.</div> : null}
      </Card>
      <NewClientModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => { reload(); navigate(`/clientes/${id}`); }} />
    </>
  );
}

function NewClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", document: "", ownerName: "", ownerEmail: "", phone: "", billingEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ client: { id: string } }>("/api/clients", { body: { ...form, phone: form.phone || null, billingEmail: form.billingEmail || null } });
      toast("Cliente cadastrado");
      setForm({ name: "", document: "", ownerName: "", ownerEmail: "", phone: "", billingEmail: "" });
      onClose();
      onCreated(result.client.id);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Novo cliente" open={open} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button busy={busy} onClick={submit}>Cadastrar</Button></>}>
      <Field label="Nome do cliente ou empresa"><Input value={form.name} onChange={set("name")} placeholder="Padaria Pão Quente Ltda." /></Field>
      <Field label="CPF ou CNPJ" hint="Obrigatório: o Asaas não emite cobrança sem ele."><Input value={form.document} onChange={set("document")} placeholder="00.000.000/0001-00" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Responsável"><Input value={form.ownerName} onChange={set("ownerName")} placeholder="Nome" /></Field>
        <Field label="E-mail do responsável"><Input type="email" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="dono@empresa.com.br" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Celular (opcional)"><Input value={form.phone} onChange={set("phone")} placeholder="(11) 99999-9999" /></Field>
        <Field label="E-mail de cobrança (opcional)"><Input type="email" value={form.billingEmail} onChange={set("billingEmail")} placeholder="financeiro@empresa.com.br" /></Field>
      </div>
      <ErrorNote message={error} />
    </Modal>
  );
}
