import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router";
import { api, UNAUTHORIZED_EVENT } from "../web/api.ts";
import { Loading } from "../web/ui.tsx";
import { EntrarPage } from "./pages/Entrar.tsx";
import { BoasVindasPage } from "./pages/BoasVindas.tsx";
import { AssinarPage } from "./pages/Assinar.tsx";
import { PainelPage } from "./pages/Painel.tsx";
import { rememberPlan, Shell, type CustomerState } from "./shared.tsx";

type Session = { loading: true } | { loading: false; state: CustomerState | null };

function KeepPlan() {
  const [params] = useSearchParams();
  useEffect(() => rememberPlan(params.get("plano")), [params]);
  return null;
}

export function ContaApp() {
  const [session, setSession] = useState<Session>({ loading: true });
  const location = useLocation();
  const refresh = useCallback(() => {
    api<{ authenticated: boolean } & Partial<CustomerState>>("/api/conta/auth/session")
      .then((result) => setSession({ loading: false, state: result.authenticated ? (result as CustomerState) : null }))
      .catch(() => setSession({ loading: false, state: null }));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    const onUnauthorized = () => setSession({ loading: false, state: null });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (session.loading) return <Loading />;
  const state = session.state;

  if (!state) {
    return (
      <>
        <KeepPlan />
        <Routes>
          <Route path="/cadastro" element={<EntrarPage mode="cadastro" onSignedIn={refresh} />} />
          <Route path="/entrar" element={<EntrarPage mode="entrar" onSignedIn={refresh} />} />
          <Route path="*" element={<Navigate to={`/entrar${location.search}`} replace />} />
        </Routes>
      </>
    );
  }

  if (state.needsOnboarding) {
    return (
      <Shell state={state}>
        <KeepPlan />
        <BoasVindasPage state={state} onDone={refresh} />
      </Shell>
    );
  }

  const neverSubscribed = state.subscriptionStatus === null;
  return (
    <Shell state={state}>
      <KeepPlan />
      <Routes>
        <Route path="/assinar" element={<AssinarPage trialAvailable={state.trialAvailable} onSubscribed={refresh} />} />
        <Route path="/" element={neverSubscribed ? <Navigate to="/assinar" replace /> : <PainelPage state={state} onChanged={refresh} />} />
        <Route path="*" element={<Navigate to={neverSubscribed ? `/assinar${location.search}` : "/"} replace />} />
      </Routes>
    </Shell>
  );
}
