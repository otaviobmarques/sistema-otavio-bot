/**
 * The body ids a bot's look may carry in `mascotBody`. They no longer pick a drawing: a stored id only steers the
 * figurinha (`shared/figurinha.ts`) toward its nearest head, so looks saved before figurinhas still parse and render.
 */

import { z } from "zod";

export const MASCOT_BODY_IDS = ["cursor", "blob", "circle", "squircle", "capsule", "drop", "shield", "hexagon", "diamond", "star"] as const;

export type MascotBodyId = (typeof MASCOT_BODY_IDS)[number];

export const mascotBodySchema = z.enum(MASCOT_BODY_IDS);

/** The id a new bot is stored with, and the fallback for any unrecognised value. */
export const DEFAULT_MASCOT_BODY: MascotBodyId = "cursor";

/** Runtime-safe read of an untrusted persisted or streamed body id. */
export function botMascotBody(value: unknown): MascotBodyId {
  return mascotBodySchema.safeParse(value).data ?? DEFAULT_MASCOT_BODY;
}
