import type { MausState } from "@/lib/mascot";
import { PERSONAGEM_ROSTO_ABAIXO_DE, type Personagem } from "../../shared/personagens";

export type PersonagemRecorteNome = "rosto" | "corpo";

const ARQUIVOS = import.meta.glob<string>("../assets/personagens/*.webp", { eager: true, import: "default", query: "?url" });

interface Imagem {
  tamanho: number;
  url: string;
}

const IMAGENS = new Map<string, Imagem[]>();
for (const [path, url] of Object.entries(ARQUIVOS)) {
  const match = /\/([\w-]+)-(rosto|corpo)-(\d+)\.webp$/.exec(path);
  if (!match) continue;
  const key = `${match[1]}:${match[2]}`;
  IMAGENS.set(key, [...(IMAGENS.get(key) ?? []), { tamanho: Number(match[3]), url }].sort((a, b) => a.tamanho - b.tamanho));
}

export const recortePara = (size: number): PersonagemRecorteNome => (size < PERSONAGEM_ROSTO_ABAIXO_DE ? "rosto" : "corpo");

/** The image and its retina sizes for a character drawn `size` CSS pixels wide; null when its files were not generated. */
export function personagemImagem(personagem: Personagem, size: number): { recorte: PersonagemRecorteNome; src: string; srcSet: string } | null {
  const recorte = recortePara(size);
  const imagens = IMAGENS.get(`${personagem.id}:${recorte}`);
  if (!imagens?.length) return null;
  const src = (imagens.find((imagem) => imagem.tamanho >= size * 2) ?? imagens.at(-1)!).url;
  return { recorte, src, srcSet: imagens.map((imagem) => `${imagem.url} ${imagem.tamanho}w`).join(", ") };
}

export type PersonagemMotion = "bob" | "dim";

const MOTION: Partial<Record<MausState, PersonagemMotion>> = {
  working: "bob", thinking: "bob", searching: "bob", loading: "bob", writing: "bob", sending: "bob", receiving: "bob", uploading: "bob",
  progress: "bob", orbit: "bob", radar: "bob",
  sleeping: "dim", drowsy: "dim", "powering-down": "dim",
};

export const personagemMotion = (state: MausState): PersonagemMotion | null => MOTION[state] ?? null;
