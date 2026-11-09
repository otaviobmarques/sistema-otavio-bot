// Teach-a-task: the person records a task on their own screen and the app drafts a skill from it. Pure rules shared by
// the recorder, the drafting route and the save path.
import { DESCRIPTION_MAX, isSkillName, parseSkillMd, SKILL_NAME_MAX, yamlFrontmatterValue } from "./skill-md.ts";

/** The `source` a saved recording carries in the skill store, so a list can show where it came from. */
export const TEACH_SKILL_SOURCE = "teach-a-task";
export const TEACH_MAX_MS = 10 * 60_000;
export const TEACH_FRAME_INTERVAL_MS = 2_000;
/** A frame that barely differs from the last one kept is dropped, unless this long has passed since it. */
export const TEACH_FRAME_HEARTBEAT_MS = 20_000;
export const TEACH_FRAME_MIN_CHANGE = 0.02;
/** Frames the recorder may hold: one every 2 s for 10 min. */
export const TEACH_FRAMES_KEPT_MAX = TEACH_MAX_MS / TEACH_FRAME_INTERVAL_MS;
/** Frames sent to the model when "Generate skill" is pressed. */
export const TEACH_DRAFT_FRAMES_MAX = 24;
export const TEACH_FRAME_BYTES_MAX = 400 * 1024;
export const TEACH_TRANSCRIPT_MAX = 40_000;
export const TEACH_BODY_MAX = 32_000;

export interface TeachFrameMeta {
  /** Milliseconds since the recording started. */
  at: number;
  /** 0..1, how much it differs from the frame kept before it; the first frame is 1. */
  change: number;
}

/** Whether a sampled frame is worth keeping: it changed enough, or the screen has been still for a heartbeat. */
export function keepTeachFrame(change: number, sinceLastKeptMs: number | null): boolean {
  if (sinceLastKeptMs === null) return true;
  return change >= TEACH_FRAME_MIN_CHANGE || sinceLastKeptMs >= TEACH_FRAME_HEARTBEAT_MS;
}

/** Mean absolute difference of two equal-length grayscale signatures (0..255 values), as 0..1. */
export function signatureChange(a: ArrayLike<number> | null, b: ArrayLike<number>): number {
  if (!a || a.length !== b.length || b.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < b.length; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return sum / (b.length * 255);
}

/** Indices (ascending) of at most `max` frames: the first and last, half the rest spread evenly over time, and the
 * remainder the frames where the screen changed most. */
export function sampleTeachFrames(frames: readonly TeachFrameMeta[], max = TEACH_DRAFT_FRAMES_MAX): number[] {
  const n = frames.length;
  if (max <= 0 || n === 0) return [];
  if (n <= max) return frames.map((_, i) => i);
  if (max === 1) return [0];
  const chosen = new Set<number>([0, n - 1]);
  const inner = max - 2;
  const evenCount = Math.ceil(inner / 2);
  const start = frames[0]!.at;
  const span = Math.max(1, frames[n - 1]!.at - start);
  for (let k = 1; k <= evenCount; k += 1) {
    const target = start + (span * k) / (evenCount + 1);
    let best = -1;
    for (let i = 1; i < n - 1; i += 1) {
      if (chosen.has(i)) continue;
      if (best === -1 || Math.abs(frames[i]!.at - target) < Math.abs(frames[best]!.at - target)) best = i;
    }
    if (best !== -1) chosen.add(best);
  }
  const byChange = frames
    .map((frame, i) => ({ i, change: frame.change }))
    .filter(({ i }) => !chosen.has(i))
    .sort((a, b) => b.change - a.change || a.i - b.i);
  for (const { i } of byChange) {
    if (chosen.size >= max) break;
    chosen.add(i);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** A lowercase-hyphenated skill name from free text: accents dropped, at most SKILL_NAME_MAX characters. */
export function slugSkillName(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/g, "");
  return slug;
}

export interface TeachSkillDraft {
  name: string;
  description: string;
  /** The SKILL.md body after the frontmatter. */
  body: string;
}

export type TeachDraftProblem = "name" | "description" | "body";

export function teachDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function teachDraftProblem(draft: TeachSkillDraft): TeachDraftProblem | null {
  if (!isSkillName(draft.name.trim())) return "name";
  const description = teachDescription(draft.description);
  if (!description || description.length > DESCRIPTION_MAX) return "description";
  const body = draft.body.trim();
  if (!body || body.length > TEACH_BODY_MAX) return "body";
  return null;
}

/** The SKILL.md a reviewed draft is saved as. Throws on a draft teachDraftProblem rejects. */
export function teachSkillMd(draft: TeachSkillDraft): string {
  const problem = teachDraftProblem(draft);
  if (problem) throw new Error(`taught skill: invalid ${problem}`);
  const name = draft.name.trim();
  const description = teachDescription(draft.description);
  const text = `---\nname: ${name}\ndescription: ${yamlFrontmatterValue(description)}\n---\n\n${draft.body.trim()}\n`;
  const parsed = parseSkillMd(text);
  if ("error" in parsed || parsed.name !== name || parsed.description !== description) throw new Error("taught skill: did not round-trip");
  return text;
}

/** POST /api/teach/draft. Frames are JPEG bytes in base64, in recording order. */
export interface TeachDraftRequest {
  frames: Array<{ at: number; jpeg: string }>;
  transcript: string;
  durationMs: number;
  /** The screen or window the person picked. */
  sourceName?: string;
  /** The app's language, e.g. "pt-br"; the skill is written in it. */
  language?: string;
}

export interface TeachDraftResponse {
  draft: TeachSkillDraft;
  /** The engine instance that wrote it. */
  engine: string;
  /** False when that engine could not take pictures and drafted from the narration alone. */
  sawFrames: boolean;
}

/** POST /api/teach/save */
export interface TeachSaveRequest {
  draft: TeachSkillDraft;
  botIds: string[];
}

export interface TeachSaveResponse {
  name: string;
  saved: Array<{ botId: string }>;
  failed: Array<{ botId: string; error: string }>;
}
