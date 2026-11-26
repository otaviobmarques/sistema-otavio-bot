/** The ArkoBot characters ("personagens") a bot is drawn as when it shows no uploaded image. */

import { z } from "zod";

import { seedHash, type FigurinhaChoice } from "./figurinha.ts";

/** A square of the original image, in fractions of its width and height (0–1). */
export interface PersonagemRecorte {
  x: number;
  y: number;
  lado: number;
}

/** Neutral ids only: each customer names their own bot, so a character never carries a name of its own. */
export interface Personagem {
  id: string;
  /** The tile behind the image: the original's own background, so the crop's edges disappear into it. */
  tile: string;
  /** Head and chest, for avatars smaller than {@link PERSONAGEM_ROSTO_ABAIXO_DE} pixels. */
  rosto: PersonagemRecorte;
  /** The whole character, for larger avatars. */
  corpo: PersonagemRecorte;
}

const FELTRO = "#F2EEEA";
const FELTRO_CORPO = { x: 0.04, y: 0.04, lado: 0.92 };

export const PERSONAGENS = [
  { id: "gravata-robo", tile: "#EEEBE4", rosto: { x: 0.28, y: 0.2, lado: 0.44 }, corpo: { x: 0.17, y: 0.2, lado: 0.66 } },
  { id: "fone", tile: FELTRO, rosto: { x: 0.27, y: 0.36, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "estrela", tile: FELTRO, rosto: { x: 0.26, y: 0.32, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "carretel", tile: FELTRO, rosto: { x: 0.23, y: 0.26, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "nuvem", tile: FELTRO, rosto: { x: 0.23, y: 0.32, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "relogio", tile: FELTRO, rosto: { x: 0.2, y: 0.24, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "atendente", tile: FELTRO, rosto: { x: 0.25, y: 0.32, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "monoculo", tile: FELTRO, rosto: { x: 0.27, y: 0.3, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "escudo", tile: FELTRO, rosto: { x: 0.28, y: 0.21, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "coracao", tile: FELTRO, rosto: { x: 0.25, y: 0.3, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "capacete", tile: FELTRO, rosto: { x: 0.25, y: 0.28, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "conversa", tile: FELTRO, rosto: { x: 0.22, y: 0.24, lado: 0.5 }, corpo: FELTRO_CORPO },
  { id: "gravata-triangulo", tile: FELTRO, rosto: { x: 0.24, y: 0.22, lado: 0.5 }, corpo: FELTRO_CORPO },
] as const satisfies readonly Personagem[];

export type PersonagemId = (typeof PERSONAGENS)[number]["id"];

/** The stored value that keeps a bot on the classic figurinha builder. */
export const PERSONAGEM_CLASSICO = "classico";

/** Avatars drawn smaller than this many CSS pixels use the `rosto` crop. */
export const PERSONAGEM_ROSTO_ABAIXO_DE = 56;

/** Every size, in pixels, the generator writes for each crop. */
export const PERSONAGEM_TAMANHOS = { rosto: [64, 128], corpo: [128, 256, 384] } as const;

const PERSONAGEM_IDS = PERSONAGENS.map((personagem) => personagem.id) as [PersonagemId, ...PersonagemId[]];

/**
 * A bot's look choice on the wire and on disk: a character id, or {@link PERSONAGEM_CLASSICO}. Absent or null, the
 * bot shows the classic figurinha when it has its own figurinha picks, and otherwise the character its id derives.
 */
export const personagemSchema = z.enum([...PERSONAGEM_IDS, PERSONAGEM_CLASSICO]);

export type PersonagemEscolha = z.infer<typeof personagemSchema>;

export function personagemPorId(id: unknown): Personagem | undefined {
  return PERSONAGENS.find((personagem) => personagem.id === id);
}

export function derivedPersonagem(seed: string): Personagem {
  return PERSONAGENS[seedHash(seed) % PERSONAGENS.length]!;
}

function pickedFigurinha(figurinha: FigurinhaChoice | null | undefined): boolean {
  return Boolean(figurinha && typeof figurinha === "object" && Object.keys(figurinha).length > 0);
}

/** The character a bot is drawn as, or null for the classic figurinha. An id this client does not know counts as absent. */
export function resolvePersonagem(input: { seed: string; choice?: string | null; figurinha?: FigurinhaChoice | null }): Personagem | null {
  if (input.choice === PERSONAGEM_CLASSICO) return null;
  const picked = personagemPorId(input.choice);
  if (picked) return picked;
  return pickedFigurinha(input.figurinha) ? null : derivedPersonagem(input.seed);
}
