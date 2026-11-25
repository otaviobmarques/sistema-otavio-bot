import { LogOut, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "../api.ts";
import { useMe } from "../App.tsx";
import { dateTime } from "../format.ts";
import { Badge, Button, Card, ErrorNote, Field, Input, KeyValue, Mono, PageHeader, Table, td, useToast } from "../ui.tsx";

const ROLE: Record<string, string> = { owner: "Dono (tudo)", operator: "Operador (lê e altera)", viewer: "Somente leitura" };

export function AccountPage() {
  const { me, refresh } = useMe();
  const toast = useToast();
  const sessions = useApi<{ sessions: { id: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string; current: boolean }[] }>("/api/me/sessions");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, body: unknown, done: (result: any) => void) => {
    setBusy(true);
    setError(null);
    try {
      done(await api(path, { body }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Minha conta" subtitle="Seu acesso à Central de Administrador." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Perfil">
          <KeyValue items={[["E-mail", me.email], ["Nome", me.name || "—"], ["Perfil", ROLE[me.role]],
            ["2º fator", me.totpEnabled ? <Badge tone="green">ativo</Badge> : <Badge tone="amber">desligado</Badge>]]} />
          <p className="mt-4 text-xs text-slate-500">Novos administradores são criados pela linha de comando: <Mono>pnpm --filter admin create-admin email</Mono>.</p>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-cyan-ink" /> Segundo fator (aplicativo autenticador)</span>}>
          {me.totpEnabled ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" /> Ativo. Depois do código por e-mail, o painel pede o código do aplicativo.</p>
              <Field label="Para desligar, digite um código do aplicativo"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="w-40 text-center font-mono tracking-[0.3em]" /></Field>
              <ErrorNote message={error} />
              <Button variant="secondary" busy={busy} onClick={() => call("/api/me/totp/disable", { code }, () => { toast("Segundo fator desligado"); setCode(""); refresh(); })}><ShieldOff className="h-4 w-4" /> Desligar</Button>
            </div>
          ) : setup ? (
            <div className="space-y-4">
              <div className="flex gap-5">
                <img src={setup.qr} alt="QR code do autenticador" className="h-40 w-40 rounded-xl border border-line" />
                <div className="text-sm text-slate-600">
                  <p>Escaneie com Google Authenticator, 1Password, Authy ou similar. Se preferir, digite a chave:</p>
                  <p className="mt-2 break-all"><Mono>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</Mono></p>
                </div>
              </div>
              <Field label="Código de 6 dígitos do aplicativo"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="w-40 text-center font-mono tracking-[0.3em]" /></Field>
              <ErrorNote message={error} />
              <Button busy={busy} onClick={() => call("/api/me/totp/enable", { code }, () => { toast("Segundo fator ativado"); setSetup(null); setCode(""); refresh(); })}>Confirmar e ativar</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Recomendado para todos os operadores: mesmo com acesso ao seu e-mail, ninguém entra sem o celular.</p>
              <ErrorNote message={error} />
              <Button busy={busy} onClick={() => call("/api/me/totp/setup", {}, setSetup)}><ShieldCheck className="h-4 w-4" /> Configurar</Button>
            </div>
          )}
        </Card>
      </div>
      <Card title="Sessões abertas" className="mt-6" padded={false} actions={
        <Button size="sm" variant="ghost" onClick={async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/login"; }}><LogOut className="h-3.5 w-3.5" /> Sair desta</Button>}>
        <Table head={["Início", "Último uso", "IP", "Navegador", ""]} empty="Nenhuma sessão.">
          {(sessions.data?.sessions ?? []).map((session) => (
            <tr key={session.id}>
              <td className={`${td} whitespace-nowrap`}>{dateTime(session.created_at)}</td>
              <td className={`${td} whitespace-nowrap`}>{dateTime(session.last_seen_at)}</td>
              <td className={td}><Mono>{session.ip ?? "—"}</Mono></td>
              <td className={`${td} max-w-md truncate text-xs text-slate-500`}>{session.user_agent ?? "—"}</td>
              <td className={td}>{session.current ? <Badge tone="cyan">esta</Badge> : null}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
