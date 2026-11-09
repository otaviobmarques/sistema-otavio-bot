/** The Otávio Bot characters ("figurinhas") a bot is drawn as when it shows no uploaded image. */

import { z } from "zod";

import { isCarvedBody } from "./bot-body.ts";
import { DIWALI_BODY_IDS } from "./carved-bodies.ts";

export const FIGURINHA_HEADS = ["rounded", "square", "round", "tall", "wide"] as const;
export const FIGURINHA_EYES = ["bright", "dots", "visor", "glasses", "happy", "code", "chart"] as const;
export const FIGURINHA_ACCESSORIES = ["none", "pencil", "antenna", "headset", "beanie", "cap", "star", "horns", "tuft", "bolt"] as const;
export const FIGURINHA_MOUTHS = ["smile", "flat", "frown", "open"] as const;

export type FigurinhaHead = (typeof FIGURINHA_HEADS)[number];
export type FigurinhaEyes = (typeof FIGURINHA_EYES)[number];
export type FigurinhaAccessory = (typeof FIGURINHA_ACCESSORIES)[number];
export type FigurinhaMouth = (typeof FIGURINHA_MOUTHS)[number];

/**
 * A bot's own picks on the wire and on disk. Each part is optional: a part left out is derived from the bot's id,
 * so a bot nobody customised still looks like itself on every client.
 */
export const figurinhaSchema = z
  .object({
    head: z.enum(FIGURINHA_HEADS).optional(),
    eyes: z.enum(FIGURINHA_EYES).optional(),
    accessory: z.enum(FIGURINHA_ACCESSORIES).optional(),
  })
  .strict();

export type FigurinhaChoice = z.infer<typeof figurinhaSchema>;

export interface FigurinhaLook {
  head: FigurinhaHead;
  eyes: FigurinhaEyes;
  accessory: FigurinhaAccessory;
}

/** FNV-1a, so the same id gives the same character in every client and every run. */
function seedHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function derivedFigurinha(seed: string): FigurinhaLook {
  const hash = seedHash(seed);
  return {
    head: FIGURINHA_HEADS[hash % FIGURINHA_HEADS.length]!,
    eyes: FIGURINHA_EYES[Math.floor(hash / 7) % FIGURINHA_EYES.length]!,
    accessory: FIGURINHA_ACCESSORIES[Math.floor(hash / 97) % FIGURINHA_ACCESSORIES.length]!,
  };
}

const LEGACY_BODY_HEAD: Partial<Record<string, FigurinhaHead>> = {
  blob: "rounded",
  circle: "round",
  squircle: "rounded",
  capsule: "tall",
  drop: "tall",
  shield: "square",
  hexagon: "wide",
  diamond: "square",
  star: "round",
};

/** A body picked before figurinhas existed keeps the nearest head; a festival costume becomes its festival's accessory. */
function legacyBodyLook(body: unknown): Partial<FigurinhaLook> {
  if (isCarvedBody(body)) return { accessory: (DIWALI_BODY_IDS as readonly string[]).includes(body) ? "star" : "horns" };
  const head = typeof body === "string" ? LEGACY_BODY_HEAD[body] : undefined;
  return head ? { head, ...(body === "star" ? { accessory: "star" as const } : {}) } : {};
}

/** The character a bot is drawn as: its own picks, then a legacy body's nearest look, then what its id derives. */
export function resolveFigurinha(input: { seed: string; choice?: unknown; body?: unknown }): FigurinhaLook {
  const choice = figurinhaSchema.safeParse(input.choice ?? {}).data ?? {};
  const legacy = legacyBodyLook(input.body);
  const derived = derivedFigurinha(input.seed);
  const costume = isCarvedBody(input.body) ? legacy.accessory : undefined;
  return {
    head: choice.head ?? legacy.head ?? derived.head,
    eyes: choice.eyes ?? derived.eyes,
    accessory: costume ?? choice.accessory ?? legacy.accessory ?? derived.accessory,
  };
}
