import { CHROME_GRADIENT, MAUS_COLORS, type MausColor, type MausState } from "@/lib/mascot";
import type { LocaleKey } from "@/locales";
import type { FigurinhaAccessory, FigurinhaEyes, FigurinhaHead, FigurinhaMouth } from "../../shared/figurinha";

export interface FigurinhaPalette {
  bg: string;
  face: string;
  accent: string;
}

function mix(hex: string, toward: string, amount: number): string {
  const a = Number.parseInt(hex.slice(1), 16);
  const b = Number.parseInt(toward.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * amount);
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/** The tile, face and accent a bot's colour paints its figurinha with: a deep tile under a light face, as in the Portal. */
export function figurinhaPalette(color: MausColor): FigurinhaPalette {
  if (color === "chrome") return { bg: "#3a4452", face: CHROME_GRADIENT[0], accent: CHROME_GRADIENT[1] };
  const fill = MAUS_COLORS[color] ?? MAUS_COLORS.green;
  return { bg: mix(fill, "#0b1020", 0.62), face: mix(fill, "#ffffff", 0.55), accent: fill };
}

const MOUTH: Partial<Record<MausState, FigurinhaMouth>> = {
  idle: "smile", happy: "smile", excited: "open", proud: "smile", celebrate: "open", laughing: "open", playful: "smile",
  curious: "smile", shy: "smile", listening: "smile", humming: "open", dictating: "open",
  surprised: "open", alerting: "open", notifying: "open", scared: "frown",
  sad: "frown", angry: "frown",
  suspicious: "flat", bored: "flat", confused: "flat", drowsy: "flat", sleeping: "flat", thinking: "flat", working: "flat",
  searching: "flat", "powering-down": "flat",
};

export const mouthForState = (state: MausState): FigurinhaMouth => MOUTH[state] ?? "smile";

export type FigurinhaMotion = "bob" | "pulse" | "pop" | "breathe";

const MOTION: Partial<Record<MausState, FigurinhaMotion>> = {
  working: "bob", thinking: "bob", searching: "bob", loading: "bob", writing: "bob", sending: "bob", receiving: "bob", uploading: "bob",
  progress: "bob", orbit: "bob", radar: "bob",
  notifying: "pulse", alerting: "pulse", listening: "pulse", dictating: "pulse",
  celebrate: "pop", spawning: "pop", waking: "pop", excited: "pop", bouncing: "pop",
  sleeping: "breathe", drowsy: "breathe",
};

/** The small motion a state plays; a state with none holds still. */
export const motionForState = (state: MausState): FigurinhaMotion | null => MOTION[state] ?? null;

export const FIGURINHA_HEAD_LABEL = {
  rounded: "figurinha.head.rounded", square: "figurinha.head.square", round: "figurinha.head.round",
  tall: "figurinha.head.tall", wide: "figurinha.head.wide",
} as const satisfies Record<FigurinhaHead, LocaleKey>;

export const FIGURINHA_EYES_LABEL = {
  bright: "figurinha.eyes.bright", dots: "figurinha.eyes.dots", visor: "figurinha.eyes.visor", glasses: "figurinha.eyes.glasses",
  happy: "figurinha.eyes.happy", code: "figurinha.eyes.code", chart: "figurinha.eyes.chart",
} as const satisfies Record<FigurinhaEyes, LocaleKey>;

export const FIGURINHA_ACCESSORY_LABEL = {
  none: "figurinha.accessory.none", pencil: "figurinha.accessory.pencil", antenna: "figurinha.accessory.antenna",
  headset: "figurinha.accessory.headset", beanie: "figurinha.accessory.beanie", cap: "figurinha.accessory.cap",
  star: "figurinha.accessory.star", horns: "figurinha.accessory.horns", tuft: "figurinha.accessory.tuft", bolt: "figurinha.accessory.bolt",
} as const satisfies Record<FigurinhaAccessory, LocaleKey>;
