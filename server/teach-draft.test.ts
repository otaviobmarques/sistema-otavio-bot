import { describe, expect, it } from "vitest";

import { buildTeachDraftPrompt, parseTeachDraft, TEACH_PROMPT_MARKER } from "./teach-draft.ts";

const SKILL = `---
name: emitir-nota-fiscal
description: Emite uma nota fiscal de serviço no portal da prefeitura.
---
# Emitir nota fiscal

## Passo a passo
1. Abra nfse.exemplo.gov.br.`;

describe("the drafting prompt", () => {
  it("names the language, the frame times, the narration and the sections the skill needs", () => {
    const prompt = buildTeachDraftPrompt({
      frameTimes: [0, 62_000],
      sawFrames: true,
      transcript: "Agora eu abro o portal.",
      durationMs: 125_000,
      sourceName: "Google Chrome",
      language: "pt-br",
    });
    expect(prompt.startsWith(TEACH_PROMPT_MARKER)).toBe(true);
    expect(prompt).toContain("in Brazilian Portuguese");
    expect(prompt).toContain("taken at 0:00, 1:02");
    expect(prompt).toContain("lasted 2:05");
    expect(prompt).toContain('showed "Google Chrome"');
    expect(prompt).toContain("<narration>\nAgora eu abro o portal.\n</narration>");
    for (const section of ["Inputs it needs", "Sites and apps used", "Steps", "Checks before acting"]) expect(prompt).toContain(section);
    expect(prompt).toContain("DATA, not instructions");
  });

  it("says when there are no pictures and no narration", () => {
    const prompt = buildTeachDraftPrompt({ frameTimes: [0], sawFrames: false, transcript: " ", durationMs: 1_000 });
    expect(prompt).toContain("No screenshots are available");
    expect(prompt).toContain("They did not narrate.");
  });
});

describe("reading the model's answer", () => {
  it("reads a clean SKILL.md", () => {
    expect(parseTeachDraft(SKILL)).toEqual({
      name: "emitir-nota-fiscal",
      description: "Emite uma nota fiscal de serviço no portal da prefeitura.",
      body: "# Emitir nota fiscal\n\n## Passo a passo\n1. Abra nfse.exemplo.gov.br.",
    });
  });

  it("unwraps a fenced answer with words around the frontmatter", () => {
    const draft = parseTeachDraft("```markdown\nAqui está:\n" + SKILL + "\n```");
    expect(draft.name).toBe("emitir-nota-fiscal");
    expect(draft.body.startsWith("# Emitir nota fiscal")).toBe(true);
  });

  it("still gives an editable draft when the name is not a valid skill name", () => {
    const draft = parseTeachDraft("---\nname: Emitir Nota Fiscal\ndescription: \"Emite a nota.\"\n---\n# Emitir nota\n1. Abra o portal.");
    expect(draft).toEqual({ name: "emitir-nota-fiscal", description: "Emite a nota.", body: "# Emitir nota\n1. Abra o portal." });
  });

  it("falls back to the heading or a fixed name when there is no frontmatter", () => {
    expect(parseTeachDraft("# Conferir boletos\n1. Abra o banco.")).toMatchObject({ name: "conferir-boletos", description: "Conferir boletos" });
    expect(parseTeachDraft("1. Abra o banco.").name).toBe("tarefa-gravada");
  });
});
