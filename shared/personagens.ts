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
  /** The tile behind the image. The originals are cut out on a transparent background, so it stays transparent. */
  tile: string;
  /** A slightly tighter framing, for avatars smaller than {@link PERSONAGEM_ROSTO_ABAIXO_DE} pixels. */
  rosto: PersonagemRecorte;
  /** The whole character, for larger avatars. */
  corpo: PersonagemRecorte;
}

// Originals are square, trimmed to the character and centred with a small transparent margin (docs/arkobot/personagens).
const SEM_FUNDO = "transparent";
const ROSTO = { x: 0.03, y: 0.03, lado: 0.94 };
const CORPO = { x: 0, y: 0, lado: 1 };

export const PERSONAGENS = [
  { id: "gravata-robo", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "fone", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "estrela", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "carretel", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "nuvem", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "relogio", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "atendente", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "monoculo", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "escudo", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "coracao", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "capacete", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "conversa", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
  { id: "gravata-triangulo", tile: SEM_FUNDO, rosto: ROSTO, corpo: CORPO },
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
