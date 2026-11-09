import { describe, expect, it } from "vitest";

import { parseSkillMd } from "./skill-md.ts";
import {
  keepTeachFrame, sampleTeachFrames, signatureChange, slugSkillName, TEACH_FRAME_HEARTBEAT_MS, teachDraftProblem, teachSkillMd,
} from "./teach-task.ts";

const frames = (count: number, change = (i: number) => (i === 0 ? 1 : 0.01)) =>
  Array.from({ length: count }, (_, i) => ({ at: i * 2_000, change: change(i) }));

describe("sampling recorded frames for the model", () => {
  it("sends every frame when there are few", () => {
    expect(sampleTeachFrames(frames(5), 24)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps the first and last, at most max, in order, spread over the whole recording", () => {
    const picked = sampleTeachFrames(frames(300), 24);
    expect(picked).toHaveLength(24);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(299);
    expect([...picked].sort((a, b) => a - b)).toEqual(picked);
    expect(new Set(picked).size).toBe(24);
    const quarters = [0, 1, 2, 3].map((q) => picked.filter((i) => i >= q * 75 && i < (q + 1) * 75).length);
    expect(quarters.every((n) => n >= 2)).toBe(true);
  });

  it("spends the rest on the moments the screen changed most", () => {
    const picked = sampleTeachFrames(frames(100, (i) => (i === 37 || i === 38 || i === 81 ? 0.9 : 0.01)), 10);
    expect(picked).toEqual(expect.arrayContaining([37, 38, 81]));
    expect(picked).toHaveLength(10);
  });

  it("handles the edge sizes", () => {
    expect(sampleTeachFrames([], 24)).toEqual([]);
    expect(sampleTeachFrames(frames(10), 1)).toEqual([0]);
    expect(sampleTeachFrames(frames(10), 2)).toEqual([0, 9]);
    expect(sampleTeachFrames(frames(10), 0)).toEqual([]);
  });
});

describe("keeping frames while recording", () => {
  it("keeps the first, a changed one, and a still one after a heartbeat", () => {
    expect(keepTeachFrame(0, null)).toBe(true);
    expect(keepTeachFrame(0.001, 2_000)).toBe(false);
    expect(keepTeachFrame(0.2, 2_000)).toBe(true);
    expect(keepTeachFrame(0, TEACH_FRAME_HEARTBEAT_MS)).toBe(true);
  });

  it("measures change between grayscale signatures", () => {
    expect(signatureChange(null, [1, 2])).toBe(1);
    expect(signatureChange([0, 0], [0, 0])).toBe(0);
    expect(signatureChange([0, 0], [255, 255])).toBe(1);
    expect(signatureChange([0, 0, 0], [0, 0])).toBe(1);
  });
});

describe("the saved SKILL.md", () => {
  it("slugs a Portuguese title into a skill name", () => {
    expect(slugSkillName("Emitir Nota Fiscal de Serviço!")).toBe("emitir-nota-fiscal-de-servico");
    expect(slugSkillName("   ")).toBe("");
    expect(slugSkillName("a".repeat(80))).toHaveLength(64);
  });

  it("round-trips name, description and body", () => {
    const text = teachSkillMd({ name: "emitir-nota", description: "Emite a nota: no portal da prefeitura.", body: "# Emitir nota\n\n1. Abra o portal." });
    const parsed = parseSkillMd(text);
    expect(parsed).toMatchObject({ name: "emitir-nota", description: "Emite a nota: no portal da prefeitura." });
    expect(text.endsWith("1. Abra o portal.\n")).toBe(true);
  });

  it("names the first problem and refuses to write a broken file", () => {
    expect(teachDraftProblem({ name: "Nota Fiscal", description: "x", body: "y" })).toBe("name");
    expect(teachDraftProblem({ name: "nota", description: "  ", body: "y" })).toBe("description");
    expect(teachDraftProblem({ name: "nota", description: "x", body: "" })).toBe("body");
    expect(() => teachSkillMd({ name: "nota", description: "x", body: "" })).toThrow(/body/);
  });
});
