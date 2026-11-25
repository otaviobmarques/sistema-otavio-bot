import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { Button, ErrorNote, Field, Input, Mark, Wordmark } from "../ui.tsx";

type Step = "email" | "code" | "totp";

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (event: FormEvent, action: () => Promise<void>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const requestCode = (event: FormEvent) => run(event, async () => {
    const result = await api<{ message: string }>("/api/auth/otp/request", { body: { email } });
    setInfo(result.message);
    setCode("");
    setStep("code");
  });

  const verifyCode = (event: FormEvent) => run(event, async () => {
    const result = await api<{ mfaRequired: boolean }>("/api/auth/otp/verify", { body: { email, code } });
    if (result.mfaRequired) {
      setCode("");
      setStep("totp");
    } else onSignedIn();
  });

  const verifyTotp = (event: FormEvent) => run(event, async () => {
    await api("/api/auth/totp/verify", { body: { code } });
    onSignedIn();
  });

  return (
    <div className="brand-glow flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Mark className="h-16 w-16 rounded-2xl ring-1 ring-white/10" />
          <Wordmark className="mt-4 text-4xl" />
          <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-400">Central de Administrador</p>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {step === "email" ? (
            <form onSubmit={requestCode} className="space-y-5">
              <div>
                <h1 className="font-display text-xl font-semibold">Entrar</h1>
                <p className="mt-1 text-sm text-slate-500">Enviaremos um código de 8 dígitos para o seu e-mail de operador.</p>
              </div>
              <Field label="E-mail">
                <Input type="email" autoFocus required autoComplete="email" placeholder="voce@domma.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <ErrorNote message={error} />
              <Button type="submit" busy={busy} className="w-full"><Mail className="h-4 w-4" /> Enviar código</Button>
            </form>
          ) : step === "code" ? (
            <form onSubmit={verifyCode} className="space-y-5">
              <div>
                <h1 className="font-display text-xl font-semibold">Digite o código</h1>
                <p className="mt-1 text-sm text-slate-500">{info} Ele vale por 10 minutos.</p>
              </div>
              <Field label="Código">
                <Input autoFocus required inputMode="numeric" autoComplete="one-time-code" placeholder="0000-0000" maxLength={9}
                  className="text-center font-mono text-lg tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <ErrorNote message={error} />
              <Button type="submit" busy={busy} className="w-full">Entrar</Button>
              <button type="button" onClick={() => setStep("email")} className="flex w-full items-center justify-center gap-1 text-sm text-slate-500 hover:text-ink">
                <ArrowLeft className="h-4 w-4" /> Usar outro e-mail
              </button>
            </form>
          ) : (
            <form onSubmit={verifyTotp} className="space-y-5">
              <div>
                <h1 className="flex items-center gap-2 font-display text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-cyan-ink" /> Segundo fator</h1>
                <p className="mt-1 text-sm text-slate-500">Abra seu aplicativo autenticador e digite o código de 6 dígitos.</p>
              </div>
              <Field label="Código do autenticador">
                <Input autoFocus required inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6}
                  className="text-center font-mono text-lg tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <ErrorNote message={error} />
              <Button type="submit" busy={busy} className="w-full">Confirmar</Button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Acesso restrito a operadores da Domma Tecnologia. Tudo aqui fica registrado na auditoria.</p>
      </div>
    </div>
  );
}
