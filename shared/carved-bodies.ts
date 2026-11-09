/** The festival costume ids a bot's look may carry in `mascotBody`; each now dresses the figurinha with its festival's accessory. */

export const HALLOWEEN_BODY_IDS = ["pumpkin", "ghost", "witch", "bat", "cat", "skull", "monster", "mummy", "vampire", "spider"] as const;

export type HalloweenBodyId = (typeof HALLOWEEN_BODY_IDS)[number];

export const DIWALI_BODY_IDS = ["rocket", "anaar", "chakri", "sparkler", "bomb", "laddu", "chakli", "jalebi", "katli", "karanji"] as const;

export type DiwaliBodyId = (typeof DIWALI_BODY_IDS)[number];

export const CARVED_BODY_IDS = [...HALLOWEEN_BODY_IDS, ...DIWALI_BODY_IDS] as const;

export type CarvedBodyId = (typeof CARVED_BODY_IDS)[number];
