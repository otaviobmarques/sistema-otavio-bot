import {
  Boxes, Building2, CreditCard, Gauge, KeyRound, LayoutDashboard, LogOut, Package, ScrollText, ServerCog, UserRound,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { api, UNAUTHORIZED_EVENT } from "./api.ts";
import { AccountPage } from "./pages/Account.tsx";
import { AuditPage } from "./pages/Audit.tsx";
import { BillingPage } from "./pages/Billing.tsx";
import { ClientDetailPage } from "./pages/ClientDetail.tsx";
import { ClientsPage } from "./pages/Clients.tsx";
import { IntegrationsPage } from "./pages/Integrations.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { OverviewPage } from "./pages/Overview.tsx";
import { ComingSoon } from "./pages/ComingSoon.tsx";
import { PlansPage } from "./pages/Plans.tsx";
import { cx, Loading, Mark, Wordmark } from "./ui.tsx";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "owner" | "operator" | "viewer";
  totpEnabled: boolean;
}

const MeContext = createContext<{ me: Me; refresh: () => void } | null>(null);
export const useMe = () => useContext(MeContext)!;
export const canWrite = (me: Me) => me.role !== "viewer";

const NAV: { to: string; label: string; icon: ReactNode; soon?: boolean }[] = [
  { to: "/", label: "Visão geral", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/clientes", label: "Clientes", icon: <Building2 className="h-4 w-4" /> },
  { to: "/planos", label: "Planos", icon: <Package className="h-4 w-4" /> },
  { to: "/cobranca", label: "Cobrança", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/instancias", label: "Instâncias", icon: <Boxes className="h-4 w-4" />, soon: true },
  { to: "/computadores", label: "Computadores", icon: <ServerCog className="h-4 w-4" />, soon: true },
  { to: "/consumo", label: "Consumo de IA", icon: <Gauge className="h-4 w-4" />, soon: true },
  { to: "/integracoes", label: "Integrações", icon: <KeyRound className="h-4 w-4" /> },
  { to: "/auditoria", label: "Auditoria", icon: <ScrollText className="h-4 w-4" /> },
];

const ROLE_LABEL: Record<Me["role"], string> = { owner: "Dono", operator: "Operador", viewer: "Somente leitura" };

function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    window.location.href = "/login";
  };
  return (
    <div className="flex min-h-screen">
      <aside className="brand-glow sticky top-0 flex h-screen w-64 shrink-0 flex-col text-slate-300">
        <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
          <Mark className="h-9 w-9 rounded-xl ring-1 ring-white/10" />
          <div className="leading-tight">
            <Wordmark className="text-xl" />
            <div className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Central de Administrador</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive ? "bg-white/10 text-white shadow-[inset_2px_0_0_#00E8F8]" : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.soon ? <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-400">em breve</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <NavLink to="/conta" className={({ isActive }) => cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", isActive ? "bg-white/10 text-white" : "hover:bg-white/5")}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-brand/15 text-cyan-brand"><UserRound className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-white">{me.name || me.email.split("@")[0]}</span>
              <span className="block truncate text-xs text-slate-400">{ROLE_LABEL[me.role]}</span>
            </span>
          </NavLink>
          <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<{ loading: boolean; me: Me | null }>({ loading: true, me: null });
  const refresh = useCallback(() => {
    api<{ authenticated: boolean; admin?: Me }>("/api/auth/session")
      .then((session) => setState({ loading: false, me: session.authenticated ? session.admin! : null }))
      .catch(() => setState({ loading: false, me: null }));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    const onUnauthorized = () => setState({ loading: false, me: null });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (state.loading) return <Loading />;
  if (!state.me) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage onSignedIn={refresh} />} />
      </Routes>
    );
  }
  return (
    <MeContext.Provider value={{ me: state.me, refresh }}>
      <Shell me={state.me}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/clientes" element={<ClientsPage />} />
          <Route path="/clientes/:id" element={<ClientDetailPage />} />
          <Route path="/planos" element={<PlansPage />} />
          <Route path="/cobranca" element={<BillingPage />} />
          <Route path="/integracoes" element={<IntegrationsPage />} />
          <Route path="/auditoria" element={<AuditPage />} />
          <Route path="/conta" element={<AccountPage />} />
          <Route path="/instancias" element={<ComingSoon kind="instances" />} />
          <Route path="/computadores" element={<ComingSoon kind="computers" />} />
          <Route path="/consumo" element={<ComingSoon kind="usage" />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </MeContext.Provider>
  );
}
