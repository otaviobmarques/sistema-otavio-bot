import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "../web/ui.tsx";
import "../web/index.css";
import { ContaApp } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ContaApp />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
