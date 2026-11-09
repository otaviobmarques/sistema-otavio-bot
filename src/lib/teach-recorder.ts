import {
  keepTeachFrame, sampleTeachFrames, signatureChange, TEACH_DRAFT_FRAMES_MAX, TEACH_FRAMES_KEPT_MAX,
} from "../../shared/teach-task";

export interface TeachFrame {
  at: number;
  /** JPEG bytes, base64. */
  jpeg: string;
  change: number;
}

/** Holds the frames worth keeping while a recording runs: one that changed enough, or one per heartbeat of stillness. */
export function createFrameCollector(max = TEACH_FRAMES_KEPT_MAX) {
  let frames: TeachFrame[] = [];
  let lastSignature: number[] | null = null;
  let lastAt: number | null = null;
  return {
    offer(at: number, grabbed: { jpeg: string; signature: number[] }): boolean {
      if (frames.length >= max) return false;
      const change = signatureChange(lastSignature, grabbed.signature);
      if (!keepTeachFrame(change, lastAt === null ? null : at - lastAt)) return false;
      frames.push({ at, jpeg: grabbed.jpeg, change });
      lastSignature = grabbed.signature;
      lastAt = at;
      return true;
    },
    frames: (): readonly TeachFrame[] => frames,
    clear() {
      frames = [];
      lastSignature = null;
      lastAt = null;
    },
  };
}

/** What "Generate skill" uploads: a sampled subset, in order. */
export function framesForDraft(frames: readonly TeachFrame[], max = TEACH_DRAFT_FRAMES_MAX): Array<{ at: number; jpeg: string }> {
  return sampleTeachFrames(frames, max).map((i) => ({ at: frames[i]!.at, jpeg: frames[i]!.jpeg }));
}

export function teachClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
