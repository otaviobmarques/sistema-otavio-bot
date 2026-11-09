import type { AuditTone, ColorKey, Status } from "../data/mock";

export interface Swatch {
  bg: string;
  face: string;
  accent: string;
  label: string;
}

export const palette: Record<ColorKey, Swatch> = {
  vermelho: { bg: "#5c1a24", face: "#fda4af", accent: "#e11d48", label: "Vermelho · RedBox" },
  roxo: { bg: "#3b2a6b", face: "#c4b5fd", accent: "#7c3aed", label: "Roxo · Vertice" },
  petroleo: { bg: "#164e63", face: "#67e8f9", accent: "#0891b2", label: "Petróleo · Domma Tecnologia" },
  laranja: { bg: "#6b3410", face: "#fdba74", accent: "#f97316", label: "Laranja · FoodX" },
  azul: { bg: "#1e2a5a", face: "#93c5fd", accent: "#3b82f6", label: "Azul · Diretoria" },
  verde: { bg: "#14532d", face: "#6ee7a0", accent: "#22c55e", label: "Verde" },
  rosa: { bg: "#5b1f45", face: "#f9a8d4", accent: "#db2777", label: "Rosa" },
  mostarda: { bg: "#4d3d06", face: "#fde047", accent: "#ca8a04", label: "Mostarda" },
  ciano: { bg: "#134e4a", face: "#5eead4", accent: "#14b8a6", label: "Ciano" },
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
