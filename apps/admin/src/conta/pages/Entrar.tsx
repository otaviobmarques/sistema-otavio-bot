import { ArrowLeft, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../../web/api.ts";
import { Button, ErrorNote, Field, Input } from "../../web/ui.tsx";
import { Logo } from "../shared.tsx";

const PLAN_NAMES: Record<string, string> = { essencial: "Essencial", profissional: "Profissional", empresa: "Empresa" };

export function EntrarPage({ mode, onSignedIn }: { mode: "entrar" | "cadastro"; onSignedIn: () => void }) {
  const [params] = useSearchParams();
  const plan = PLAN_NAMES[params.get("plano") ?? ""];
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    await api("/api/conta/auth/otp/request", { body: { email } });
    setCode("");
    setStep("code");
  });

  const verifyCode = (event: FormEvent) => run(event, async () => {
    await api("/api/conta/auth/otp/verify", { body: { email, code } });
    onSignedIn();
  });

  const signup = mode === "cadastro";
  const other = `${signup ? "/entrar" : "/cadastro"}${params.toString() ? `?${params}` : ""}`;

  return (
    <div className="brand-glow flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="text-3xl" dark />
          <p className="mt-3 text-sm text-slate-300">{signup ? "Sua equipe de bots começa aqui." : "Área do cliente"}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          {step === "email" ? (
            <form onSubmit={requestCode} className="space-y-5">
              <div>
                <h1 className="font-display text-xl font-semibold">{signup ? "Criar sua conta" : "Entrar na sua conta"}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {signup && plan ? <>Você escolheu o plano <b className="text-ink">{plan}</b>. </> : null}
                  Sem senha: enviamos um código de 8 dígitos para o seu e-mail.
                </p>
              </div>
              <Field label="Seu e-mail">
                <Input type="email" autoFocus required autoComplete="email" placeholder="voce@suaempresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <ErrorNote message={error} />
              <Button type="submit" busy={busy} className="w-full"><Mail className="h-4 w-4" /> Receber código</Button>
              <p className="text-center text-sm text-slate-500">
                {signup ? "Já tem conta?" : "Ainda não é cliente?"}{" "}
                <Link to={other} className="font-medium text-cyan-ink hover:underline">{signup ? "Entrar" : "Criar conta"}</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-5">
              <div>
                <h1 className="font-display text-xl font-semibold">Confira o seu e-mail</h1>
                <p className="mt-1 text-sm text-slate-500">Enviamos um código para <b className="text-ink">{email}</b>. Ele vale por 10 minutos; veja também a caixa de spam.</p>
              </div>
              <Field label="Código">
                <Input autoFocus required inputMode="numeric" autoComplete="one-time-code" placeholder="0000-0000" maxLength={9}
                  className="text-center font-mono text-lg tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <ErrorNote message={error} />
              <Button type="submit" busy={busy} className="w-full">{signup ? "Continuar" : "Entrar"}</Button>
              <button type="button" onClick={() => setStep("email")} className="flex w-full items-center justify-center gap-1 text-sm text-slate-500 hover:text-ink">
                <ArrowLeft className="h-4 w-4" /> Usar outro e-mail
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Ao continuar, você concorda em receber este código por e-mail. <a href="https://arkobot.com.br/privacidade/" target="_blank" rel="noreferrer" className="underline hover:text-white">Privacidade</a>
        </p>
      </div>
    </div>
  );
}
