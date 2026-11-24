/** The opening video ends on the full logo here, before its last frames, then fades into the app. */
export const OPENING_END_SECONDS = 6.2;
export const OPENING_FADE_MS = 400;
/** With reduced motion, the logo alone for this long. */
export const OPENING_POSTER_MS = 800;
/** Whatever the video does (stalls, never starts), the app shows by then. */
export const OPENING_LIMIT_MS = 7_000;
/** Loud enough to hear, never a blast when the computer starts. */
export const OPENING_VOLUME = 0.6;
/** The sound stops this fast when the person skips; at the natural end it fades with the picture. */
export const OPENING_SKIP_SOUND_MS = 150;
export const OPENING_VIDEO = "/abertura/arkobot.mp4";
export const OPENING_POSTER = "/abertura/arkobot-poster.jpg";

export type OpeningPlan = "video" | "poster" | "none";

/** `claimed`: the desktop app said this is the launch's first page and the person keeps the opening on. */
export function openingPlan(claimed: boolean, reducedMotion: boolean): OpeningPlan {
  if (!claimed) return "none";
  return reducedMotion ? "poster" : "video";
}

/** Reduced motion shows the poster, which has no sound. */
export const openingWithSound = (plan: OpeningPlan, sound: boolean): boolean => plan === "video" && sound;

/** The volume `elapsed` ms into a fade from `from` that lasts `ms`. */
export function fadedVolume(from: number, elapsed: number, ms: number): number {
  return ms <= 0 ? 0 : Math.max(0, from * (1 - elapsed / ms));
}

/** Why the opening leaves: the person skipped it, or it reached its end. */
export type OpeningLeave = "skip" | "end";

export interface OpeningRun {
  /** The video's clock moved. */
  progress(seconds: number): void;
  /** The video ended ("end"), or the person clicked or pressed a key ("skip"). */
  finish(why: OpeningLeave): void;
  /** The video could not load or play: the app shows at once, with no fade. */
  fail(): void;
  dispose(): void;
}

/** One showing of the opening: `fade(why)` once when it starts leaving, `done()` once when it is gone. */
export function createOpeningRun(plan: Exclude<OpeningPlan, "none">, { fade, done, schedule = (run, ms) => window.setTimeout(run, ms), cancel = (timer) => window.clearTimeout(timer) }: {
  fade(why: OpeningLeave): void;
  done(): void;
  schedule?: (run: () => void, ms: number) => number;
  cancel?: (timer: number) => void;
}): OpeningRun {
  let leaving = false, gone = false;
  const timers: number[] = [];
  const later = (run: () => void, ms: number) => { timers.push(schedule(run, ms)); };
  const end = () => {
    if (gone) return;
    gone = true;
    for (const timer of timers) cancel(timer);
    done();
  };
  const finish = (why: OpeningLeave) => {
    if (leaving) return;
    leaving = true;
    fade(why);
    later(end, OPENING_FADE_MS);
  };
  later(() => finish("end"), plan === "poster" ? OPENING_POSTER_MS : OPENING_LIMIT_MS);
  return {
    progress: (seconds) => { if (seconds >= OPENING_END_SECONDS) finish("end"); },
    finish,
    fail: end,
    dispose: () => { gone = true; for (const timer of timers) cancel(timer); },
  };
}
