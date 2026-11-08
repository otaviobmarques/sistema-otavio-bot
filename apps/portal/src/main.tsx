import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { Shell } from "./components/Shell";
import { PortalProvider } from "./state/store";
import { PredioPage } from "./pages/Predio";
import { AoVivoPage } from "./pages/AoVivo";
import { ChatPage } from "./pages/Chat";
import { ComputadorPage } from "./pages/Computador";
import { EmpresasPage } from "./pages/Empresas";
import { ConselhoPage } from "./pages/Conselho";
import { ContratarPage } from "./pages/Contratar";
import { ExtensoesPage } from "./pages/Extensoes";
import { TavinhoPage } from "./pages/Tavinho";
import { FigurinhasPage } from "./pages/Figurinhas";
import { NotFoundPage } from "./pages/NotFound";

const root = document.getElementById("root");
if (!root) throw new Error("elemento #root ausente");

createRoot(root).render(
  <StrictMode>
    <PortalProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<PredioPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="chat/:conversationId" element={<ChatPage />} />
            <Route path="computador/:botId" element={<ComputadorPage />} />
            <Route path="empresas" element={<EmpresasPage />} />
            <Route path="empresas/:companyId" element={<EmpresasPage />} />
            <Route path="conselho" element={<ConselhoPage />} />
            <Route path="contratar" element={<ContratarPage />} />
            <Route path="extensoes" element={<ExtensoesPage />} />
            <Route path="figurinhas" element={<FigurinhasPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route element={<Shell bare />}>
            <Route path="ao-vivo" element={<AoVivoPage />} />
            <Route path="tavinho" element={<TavinhoPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PortalProvider>
  </StrictMode>,
);
