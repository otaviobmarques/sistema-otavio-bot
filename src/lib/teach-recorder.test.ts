import { describe, expect, it } from "vitest";

import { teachDepartments } from "@/components/teach/TeachBotPicker";
import { TEACH_FRAME_HEARTBEAT_MS } from "../../shared/teach-task";
import { narrationClips, narrationMode } from "./teach-narration";
import { createFrameCollector, framesForDraft, teachClock } from "./teach-recorder";

const still = Array.from({ length: 160 }, () => 10);
const changed = Array.from({ length: 160 }, (_, i) => (i < 80 ? 200 : 10));

describe("collecting frames while recording", () => {
  it("drops a still screen until the heartbeat and keeps every real change", () => {
    const collector = createFrameCollector();
    expect(collector.offer(0, { jpeg: "a", signature: still })).toBe(true);
    expect(collector.offer(2_000, { jpeg: "b", signature: still })).toBe(false);
    expect(collector.offer(4_000, { jpeg: "c", signature: changed })).toBe(true);
    expect(collector.offer(4_000 + TEACH_FRAME_HEARTBEAT_MS, { jpeg: "d", signature: changed })).toBe(true);
    expect(collector.frames().map((frame) => frame.jpeg)).toEqual(["a", "c", "d"]);
    expect(collector.frames()[1]!.change).toBeGreaterThan(0.3);
    collector.clear();
    expect(collector.frames()).toEqual([]);
  });

  it("stops at its cap and uploads a sampled subset in order", () => {
    const collector = createFrameCollector(30);
    for (let i = 0; i < 40; i += 1) collector.offer(i * 2_000, { jpeg: `f${i}`, signature: i % 2 ? changed : still });
    expect(collector.frames()).toHaveLength(30);
    const sent = framesForDraft(collector.frames(), 8);
    expect(sent).toHaveLength(8);
    expect(sent[0]).toEqual({ at: 0, jpeg: "f0" });
    expect(sent.map((frame) => frame.at)).toEqual(sent.map((frame) => frame.at).sort((a, b) => a - b));
  });

  it("shows the timer as m:ss", () => {
    expect(teachClock(0)).toBe("0:00");
    expect(teachClock(65_400)).toBe("1:05");
    expect(teachClock(600_000)).toBe("10:00");
  });
});

describe("narration", () => {
  it("transcribes on the device on the Mac, at Generate skill with a Fish Audio key, and not at all otherwise", () => {
    expect(narrationMode("apple-speech", true, false)).toBe("device");
    expect(narrationMode("fish-audio", true, true)).toBe("on-generate");
    expect(narrationMode("fish-audio", true, false)).toBe("none");
    expect(narrationMode("none", false, true)).toBe("none");
  });

  it("cuts held audio into clips and leaves out the silent ones", () => {
    const loud = new Float32Array(1_000).fill(0.2);
    const quiet = new Float32Array(1_000);
    const clips = narrationClips([loud, loud, quiet, quiet, loud], 2, 1_000);
    expect(clips.map((clip) => clip.length)).toEqual([2, 1]);
  });
});

describe("departments in the bot picker", () => {
  it("groups bots by their sidebar section, named ones first, the rest last", () => {
    expect(teachDepartments([
      { id: "a", section: "Vendas" }, { id: "b" }, { id: "c", section: "Financeiro" }, { id: "d", section: "Vendas" },
    ])).toEqual([
      { name: "Financeiro", botIds: ["c"] },
      { name: "Vendas", botIds: ["a", "d"] },
      { name: null, botIds: ["b"] },
    ]);
  });
});
