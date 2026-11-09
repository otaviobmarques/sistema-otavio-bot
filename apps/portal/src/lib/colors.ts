import type { AuditTone, ColorKey, Status } from "../data/mock";

export interface Swatch {
  bg: string;
  face: string;
  accent: string;
  label: string;
}

export const palette: Record<ColorKey, Swatch> = {
  roxo: { bg: "#3b2a6b", face: "#c4b5fd", accent: "#7c3aed", label: "Roxo · Criação" },
  azul: { bg: "#1e2a5a", face: "#93c5fd", accent: "#3b82f6", label: "Azul · Diretoria" },
  verde: { bg: "#14532d", face: "#6ee7a0", accent: "#22c55e", label: "Verde · Comercial e vendas" },
  petroleo: { bg: "#164e63", face: "#67e8f9", accent: "#0891b2", label: "Petróleo · Suporte" },
  rosa: { bg: "#5b1f45", face: "#f9a8d4", accent: "#db2777", label: "Rosa · Marketing" },
  laranja: { bg: "#6b3410", face: "#fdba74", accent: "#f97316", label: "Laranja · Tráfego pago" },
  mostarda: { bg: "#4d3d06", face: "#fde047", accent: "#ca8a04", label: "Mostarda · Produto" },
  ciano: { bg: "#134e4a", face: "#5eead4", accent: "#14b8a6", label: "Ciano · Atendimento" },
};

export const statusColor: Record<Status, string> = {
  trabalhando: "#22c55e",
  esperando: "#f59e0b",
  bloqueado: "#ef4444",
  ocioso: "#6b7280",
};

export const toneColor: Record<AuditTone, string> = {
  ok: "#22c55e",
  wait: "#f59e0b",
  block: "#ef4444",
  deny: "#ef4444",
};
