import { useState, type FormEvent } from "react";
import { LEGAL_DOCUMENTS } from "../../customer/catalog.ts";
import { api } from "../../web/api.ts";
import { Button, Card, ErrorNote, Field, Input, cx } from "../../web/ui.tsx";
import type { CustomerState } from "../shared.tsx";

function maskDocument(raw: string, type: "cpf" | "cnpj"): string {
  const d = raw.replace(/\D/g, "").slice(0, type === "cpf" ? 11 : 14);
  if (type === "cpf") return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function BoasVindasPage({ state, onDone }: { state: CustomerState; onDone: () => void }) {
  const hasOrganization = state.organization !== null;
  const [form, setForm] = useState({
    name: state.account.name, phone: maskPhone(state.account.phone ?? ""), companyName: "", documentType: "cnpj" as "cpf" | "cnpj", document: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/conta/cadastro", {
        body: hasOrganization
          ? { name: form.name, phone: form.phone, acceptTerms: accepted }
          : { ...form, acceptTerms: accepted },
      });
      onDone();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onlyTerms = hasOrganization && state.account.name.trim() !== "";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold tracking-tight">{onlyTerms ? "Atualizamos os nossos termos" : "Boas-vindas ao ArkoBot!"}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {onlyTerms ? "Para continuar usando a sua conta, leia e aceite a versão atual." : "Faltam só alguns dados para emitirmos as suas cobranças e notas."}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-6">
        <Card title="Sobre você">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seu nome"><Input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Maria Silva" /></Field>
            <Field label="Celular (WhatsApp)"><Input required inputMode="tel" autoComplete="tel-national" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} placeholder="(11) 91234-5678" /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">E-mail de acesso: <b>{state.account.email}</b></p>
        </Card>

        {hasOrganization ? (
          <Card title="Empresa"><p className="text-sm text-slate-600">{state.organization!.name}</p></Card>
        ) : (
          <Card title="Empresa (para a cobrança)">
            <div className="space-y-4">
              <div className="inline-flex rounded-lg border border-line p-1">
                {(["cnpj", "cpf"] as const).map((type) => (
                  <button key={type} type="button" onClick={() => setForm({ ...form, documentType: type, document: maskDocument(form.document, type) })}
                    className={cx("rounded-md px-4 py-1.5 text-sm font-medium transition", form.documentType === type ? "bg-navy-950 text-white" : "text-slate-600 hover:bg-slate-100")}>
                    {type === "cnpj" ? "Empresa (CNPJ)" : "Pessoa física (CPF)"}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={form.documentType === "cnpj" ? "Razão social ou nome fantasia" : "Nome completo"}>
                  <Input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder={form.documentType === "cnpj" ? "Padaria Pão Bom Ltda" : "Maria Silva"} />
                </Field>
                <Field label={form.documentType.toUpperCase()}>
                  <Input required inputMode="numeric" value={form.document} onChange={(e) => setForm({ ...form, document: maskDocument(e.target.value, form.documentType) })}
                    placeholder={form.documentType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"} />
                </Field>
              </div>
            </div>
          </Card>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-5 text-sm">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0786a0]" />
          <span>
            Li e aceito os{" "}
            {LEGAL_DOCUMENTS.map((doc, i) => (
              <span key={doc.document}>
                {i > 0 ? " e a " : null}
                <a href={doc.url} target="_blank" rel="noreferrer" className="font-medium text-cyan-ink underline">{doc.title}</a>
              </span>
            ))}{" "}
            do ArkoBot.
            <span className="mt-1 block text-xs text-slate-500">Guardamos a data, o IP e a versão aceita, como pede a LGPD.</span>
          </span>
        </label>

        <ErrorNote message={error} />
        <Button type="submit" busy={busy} disabled={!accepted} className="w-full sm:w-auto">Continuar</Button>
      </form>
    </div>
  );
}
