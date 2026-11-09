import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseSkillMd, scanSkillText } from "../shared/skill-md.ts";
import {
  sampleTeachFrames, TEACH_DRAFT_FRAMES_MAX, TEACH_FRAME_BYTES_MAX, TEACH_MAX_MS, TEACH_SKILL_SOURCE, TEACH_TRANSCRIPT_MAX,
  teachSkillMd, type TeachDraftRequest, type TeachDraftResponse, type TeachSaveResponse, type TeachSkillDraft,
} from "../shared/teach-task.ts";
import type { ProviderInstance, TurnImageInput } from "./contracts.ts";
import { installLibrarySkill } from "./skill-library.ts";
import { installSkill, setSkillEnabled } from "./skills.ts";
import { buildTeachDraftPrompt, parseTeachDraft } from "./teach-draft.ts";

export const TEACH_DRAFT_TIMEOUT_MS = 3 * 60_000;
const CLAUDE = "claudeAgent";

export type TeachEngine = Pick<ProviderInstance, "instanceId" | "driverKind" | "displayName" | "enabled" | "models" | "generateText" | "generateMemoryText">;

/** Claude first, since its one-off call can look at the frames; the bot's own engine before any other. */
export function pickTeachEngine(engines: readonly TeachEngine[], preferredInstanceId?: string): TeachEngine | null {
  const usable = engines.filter((engine) => engine.enabled && (engine.generateText || engine.generateMemoryText));
  const rank = (engine: TeachEngine) =>
    (engine.driverKind === CLAUDE && engine.generateText ? 0 : 2) + (engine.instanceId === preferredInstanceId ? 0 : 1);
  return [...usable].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function seesFrames(engine: TeachEngine): boolean {
  return engine.driverKind === CLAUDE && Boolean(engine.generateText);
}

export type TeachDraftInputProblem = { error: string };

/** The request's frames as JPEG bytes, sampled down to what the model is sent. */
export function teachDraftFrames(request: TeachDraftRequest): Array<{ at: number; bytes: Buffer }> | TeachDraftInputProblem {
  if (!Array.isArray(request.frames)) return { error: "frames must be a list" };
  const decoded: Array<{ at: number; bytes: Buffer }> = [];
  for (const frame of request.frames.slice(0, TEACH_MAX_MS / 1000)) {
    if (typeof frame?.jpeg !== "string" || typeof frame.at !== "number" || !Number.isFinite(frame.at)) return { error: "each frame needs at and jpeg" };
    const bytes = Buffer.from(frame.jpeg, "base64");
    if (bytes.byteLength > TEACH_FRAME_BYTES_MAX) return { error: "a frame is too large" };
    if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { error: "frames must be JPEG pictures" };
    decoded.push({ at: Math.max(0, Math.min(TEACH_MAX_MS, frame.at)), bytes });
  }
  const picked = sampleTeachFrames(decoded.map((frame, i) => ({ at: frame.at, change: i === 0 ? 1 : 0 })), TEACH_DRAFT_FRAMES_MAX);
  return picked.map((i) => decoded[i]!);
}

/** Writes the frames into a private folder only for the length of the call, then removes it whatever happens. */
export async function draftTeachSkill(input: {
  request: TeachDraftRequest;
  engine: TeachEngine;
  workDir: string;
  signal?: AbortSignal;
}): Promise<TeachDraftResponse | TeachDraftInputProblem> {
  const frames = teachDraftFrames(input.request);
  if ("error" in frames) return frames;
  const transcript = typeof input.request.transcript === "string" ? input.request.transcript.slice(0, TEACH_TRANSCRIPT_MAX) : "";
  if (!frames.length && !transcript.trim()) return { error: "the recording has no frames and no narration" };
  const sawFrames = seesFrames(input.engine) && frames.length > 0;
  const prompt = buildTeachDraftPrompt({
    frameTimes: frames.map((frame) => frame.at),
    sawFrames,
    transcript,
    durationMs: Math.max(0, Math.min(TEACH_MAX_MS, Number(input.request.durationMs) || 0)),
    sourceName: typeof input.request.sourceName === "string" ? input.request.sourceName.slice(0, 200) : undefined,
    language: typeof input.request.language === "string" ? input.request.language : undefined,
  });
  const folder = join(input.workDir, randomUUID());
  try {
    let images: TurnImageInput[] = [];
    if (sawFrames) {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      images = frames.map((frame, i) => {
        const path = join(folder, `frame-${String(i).padStart(3, "0")}.jpg`);
        writeFileSync(path, frame.bytes, { mode: 0o600 });
        return { path, mime: "image/jpeg", bytes: frame.bytes.byteLength };
      });
    }
    const options = { signal: input.signal, timeoutMs: TEACH_DRAFT_TIMEOUT_MS, ...(sawFrames ? { images, model: input.engine.models.default } : {}) };
    const call = input.engine.generateText ?? input.engine.generateMemoryText;
    const reply = await call!.call(input.engine, prompt, options);
    return { draft: parseTeachDraft(reply), engine: input.engine.displayName ?? input.engine.instanceId, sawFrames };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Library on: one library copy, approved (the person just reviewed it), assigned to each bot. Off: a copy per bot,
 * switched on, as the bot settings' own write-a-command card stores one. */
export function saveTeachSkill(input: {
  draft: TeachSkillDraft;
  botIds: readonly string[];
  libraryOn: boolean;
  assigned: (botId: string) => readonly string[] | undefined;
  assign: (botId: string, names: string[]) => void;
}): TeachSaveResponse | TeachDraftInputProblem {
  let text: string;
  try {
    text = teachSkillMd(input.draft);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const parsed = parseSkillMd(text);
  if ("error" in parsed) return parsed;
  const name = parsed.name;
  const saved: TeachSaveResponse["saved"] = [];
  const failed: TeachSaveResponse["failed"] = [];
  if (input.libraryOn) {
    const installed = installLibrarySkill({
      name, instructions: text, source: TEACH_SKILL_SOURCE, warnings: scanSkillText(text), reviewState: "approved",
    });
    if ("error" in installed) return installed;
    for (const botId of input.botIds) {
      input.assign(botId, [...new Set([...(input.assigned(botId) ?? []), name])]);
      saved.push({ botId });
    }
    return { name, saved, failed };
  }
  for (const botId of input.botIds) {
    const installed = installSkill(botId, TEACH_SKILL_SOURCE, [{ path: "SKILL.md", content: text }]);
    if ("error" in installed) {
      failed.push({ botId, error: installed.error });
      continue;
    }
    const enabled = setSkillEnabled(botId, name, true);
    if ("error" in enabled) failed.push({ botId, error: enabled.error });
    else saved.push({ botId });
  }
  return { name, saved, failed };
}
