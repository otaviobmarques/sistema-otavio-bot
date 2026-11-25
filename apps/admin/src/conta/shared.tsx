import { LogOut, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { SUPPORT_WHATSAPP_DISPLAY, whatsappLink } from "../customer/catalog.ts";
import { api } from "../web/api.ts";
import type { Tone } from "../web/format.ts";
import { cx, Mark } from "../web/ui.tsx";

export interface CustomerState {
  authenticated: true;
  account: { email: string; name: string; phone: string | null };
  organization: { id: string; name: string; document_type: "cpf" | "cnpj"; document: string; status: string } | null;
  role: "owner" | "admin" | "member" | null;
  subscriptionStatus: string | null;
  needsOnboarding: boolean;
  pendingDocuments: string[];
}

export function Logo({ className = "text-2xl", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark className="h-8 w-8 rounded-lg" />
      <span className={cx("font-display font-extrabold tracking-tight", className)}>
        <span className={dark ? "text-white" : "text-navy-950"}>arko</span>
        <span className={dark ? "text-cyan-brand" : "text-cyan-ink"}>bot</span>
      </span>
    </span>
  );
}

export function WhatsAppButton({ children = "Falar no WhatsApp", message, className }: { children?: ReactNode; message?: string; className?: string }) {
  return (
    <a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer"
      className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700", className)}>
      <MessageCircle className="h-4 w-4" /> {children}
    </a>
  );
}

export function Shell({ state, children }: { state: CustomerState | null; children: ReactNode }) {
  const logout = async () => {
    await api("/api/conta/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    window.location.href = "/entrar";
  };
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="ArkoBot, início"><Logo className="text-xl" /></Link>
          {state ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-right leading-tight sm:block">
                <span className="block font-medium text-ink">{state.account.name || state.account.email}</span>
                {state.organization ? <span className="block text-xs text-slate-500">{state.organization.name}</span> : null}
              </span>
              <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-ink">
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>ArkoBot · Domma Tecnologia · CNPJ 70.075.405/0001-74</span>
          <span className="flex flex-wrap gap-4">
            <a className="hover:text-ink" href="https://arkobot.com.br/termos/" target="_blank" rel="noreferrer">Termos de Uso</a>
            <a className="hover:text-ink" href="https://arkobot.com.br/privacidade/" target="_blank" rel="noreferrer">Privacidade</a>
            <a className="hover:text-ink" href={whatsappLink()} target="_blank" rel="noreferrer">Ajuda: {SUPPORT_WHATSAPP_DISPLAY}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export const CUSTOMER_SUB_STATUS: Record<string, [string, Tone]> = {
  pending: ["Pendente", "cyan"],
  active: ["Em dia", "green"],
  past_due: ["Em atraso", "red"],
  suspended: ["Suspensa", "amber"],
  canceled: ["Cancelada", "slate"],
};

export const CUSTOMER_BILLING_LABEL: Record<string, string> = { PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão de crédito" };

const PLAN_KEY = "arko:plano";

/** The plan picked on the site travels through login and onboarding; storage may be unavailable, which only loses the preselection. */
export function rememberPlan(code: string | null) {
  if (!code) return;
  try {
    sessionStorage.setItem(PLAN_KEY, code);
  } catch {
    /* storage blocked */
  }
}

export function rememberedPlan(): string | null {
  try {
    return sessionStorage.getItem(PLAN_KEY);
  } catch {
    return null;
  }
}
