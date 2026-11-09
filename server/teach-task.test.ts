import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { TEACH_SKILL_SOURCE, type TeachDraftResponse, type TeachSaveResponse } from "../shared/teach-task.ts";
import type { AppConfig } from "./config.ts";
import type { TextGenerationOptions } from "./contracts.ts";
import { json, readBody } from "./harness/http.ts";
import type { RequestAuth } from "./request-auth.ts";
import { createTeachTaskRoutes } from "./routes/teach-task.ts";
import { dispatchRoutes } from "./routes/table.ts";
import { listLibrarySkills, readSkillLibraryIndex } from "./skill-library.ts";
import { listSkills, readSkillFile } from "./skills.ts";
import { pickTeachEngine, saveTeachSkill, teachDraftFrames, type TeachEngine } from "./teach-task.ts";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");
const uid = () => Math.random().toString(36).slice(2, 10);

function engine(over: Partial<TeachEngine> & { reply?: string; seen?: Array<{ prompt: string; options?: TextGenerationOptions; files: string[] }> } = {}): TeachEngine {
  const { reply = "", seen, ...rest } = over;
  return {
    instanceId: "claude-1",
    driverKind: "claudeAgent",
    displayName: "Claude",
    enabled: true,
    models: { default: "claude-sonnet-5", options: [] },
    generateText: async (prompt, options) => {
      seen?.push({ prompt, options, files: (options?.images ?? []).filter((image) => existsSync(image.path)).map((image) => image.path) });
      return reply;
    },
    ...rest,
  } as TeachEngine;
}

describe("choosing the engine that drafts", () => {
  const codex = engine({ instanceId: "codex-1", driverKind: "codex", displayName: "Codex", generateText: undefined, generateMemoryText: async () => "" });
  it("prefers Claude, which can look at the frames, over the bot's own other engine", () => {
    expect(pickTeachEngine([codex, engine()], "codex-1")?.instanceId).toBe("claude-1");
  });
  it("prefers the bot's own Claude among several", () => {
    expect(pickTeachEngine([engine(), engine({ instanceId: "claude-2" })], "claude-2")?.instanceId).toBe("claude-2");
  });
  it("falls back to any connected engine, and to none", () => {
    expect(pickTeachEngine([codex, engine({ enabled: false })])?.instanceId).toBe("codex-1");
    expect(pickTeachEngine([engine({ generateText: undefined })])).toBeNull();
  });
});

describe("frames a draft request may carry", () => {
  it("refuses anything that is not a JPEG and caps the count", () => {
    expect(teachDraftFrames({ frames: [{ at: 0, jpeg: Buffer.from("<svg/>").toString("base64") }], transcript: "", durationMs: 0 })).toEqual({ error: "frames must be JPEG pictures" });
    const many = teachDraftFrames({ frames: Array.from({ length: 80 }, (_, i) => ({ at: i * 2_000, jpeg: JPEG })), transcript: "", durationMs: 160_000 });
    expect(Array.isArray(many) && many.length).toBe(24);
  });
});

describe("saving a reviewed draft", () => {
  it("installs a switched-on copy for each bot, marked as recorded", () => {
    const bots = [`teach-a-${uid()}`, `teach-b-${uid()}`];
    const name = `conferir-boletos-${uid()}`;
    const result = saveTeachSkill({
      draft: { name, description: "Confere os boletos do mês.", body: "# Conferir boletos\n\n1. Abra o banco." },
      botIds: bots, libraryOn: false, assigned: () => [], assign: () => { throw new Error("library is off"); },
    });
    expect(result).toEqual({ name, saved: bots.map((botId) => ({ botId })), failed: [] });
    for (const botId of bots) {
      expect(listSkills(botId)).toEqual([expect.objectContaining({ name, enabled: true, source: TEACH_SKILL_SOURCE })]);
      expect(readSkillFile(botId, name)).toContain("1. Abra o banco.");
    }
  });

  it("with the library on, stores one approved copy and adds it to each bot's list", () => {
    const name = `emitir-nota-${uid()}`;
    const assigned = new Map<string, string[]>([["bot-1", ["other"]]]);
    const result = saveTeachSkill({
      draft: { name, description: "Emite a nota.", body: "# Emitir\n1. Abra o portal." },
      botIds: ["bot-1", "bot-2"], libraryOn: true,
      assigned: (id) => assigned.get(id), assign: (id, names) => assigned.set(id, names),
    });
    expect(result).toMatchObject({ name, failed: [] });
    expect(assigned.get("bot-1")).toEqual(["other", name]);
    expect(assigned.get("bot-2")).toEqual([name]);
    expect(readSkillLibraryIndex()[name]).toMatchObject({ source: TEACH_SKILL_SOURCE, reviewState: "approved" });
    expect(listLibrarySkills().find((skill) => skill.name === name)?.enabled).toBe(true);
  });

  it("refuses a draft with an invalid name", () => {
    expect(saveTeachSkill({ draft: { name: "Nome Ruim", description: "x", body: "y" }, botIds: ["b"], libraryOn: false, assigned: () => [], assign: () => {} }))
      .toEqual({ error: "taught skill: invalid name" });
  });
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

async function serve(deps: Parameters<typeof createTeachTaskRoutes>[0]) {
  const routes = [createTeachTaskRoutes(deps)];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const auth = { kind: "loopback", scopes: ["admin"] } as unknown as RequestAuth;
    if (!await dispatchRoutes(routes, { req, res, url, path: url.pathname, method: req.method ?? "GET", auth, json, readBody })) json(res, 404, {});
  });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("the Teach-a-task routes, end to end with a scripted engine", () => {
  it("drafts from frames and narration, deletes the frames, then saves the edited skill to the bot", async () => {
    const botId = `teach-route-${uid()}`;
    const work = join(mkdtempSync(join(tmpdir(), "omb-teach-test-")), "teach");
    const seen: Array<{ prompt: string; options?: TextGenerationOptions; files: string[] }> = [];
    const reply = "---\nname: lancar-despesa\ndescription: Lança uma despesa no sistema financeiro.\n---\n# Lançar despesa\n\n1. Abra financeiro.exemplo.com.";
    const base = await serve({
      cfg: () => ({}) as AppConfig,
      engines: () => [engine({ reply, seen })],
      bot: (id) => (id === botId ? { id, modelSelection: { instanceId: "claude-1", model: "claude-sonnet-5" }, assignedSkills: [] } : undefined),
      assignSkills: () => {},
      workDir: () => work,
    });

    const drafted = await fetch(`${base}/api/teach/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frames: [{ at: 0, jpeg: JPEG }, { at: 4_000, jpeg: JPEG }],
        transcript: "Primeiro abro o financeiro e clico em Nova despesa.",
        durationMs: 6_000, sourceName: "Chrome", language: "pt-br", botId,
      }),
    });
    expect(drafted.status).toBe(200);
    const body = (await drafted.json()) as TeachDraftResponse;
    expect(body).toMatchObject({ engine: "Claude", sawFrames: true, draft: { name: "lancar-despesa" } });
    expect(seen[0]!.prompt).toContain("Nova despesa");
    expect(seen[0]!.options).toMatchObject({ model: "claude-sonnet-5" });
    expect(seen[0]!.files).toHaveLength(2);
    expect(seen[0]!.files.every((file) => file.startsWith(work))).toBe(true);
    expect(existsSync(work) ? readdirSync(work) : []).toEqual([]);

    const name = `lancar-despesa-${uid()}`;
    const saved = await fetch(`${base}/api/teach/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: { ...body.draft, name, body: `${body.draft.body}\n2. Confira o valor antes de salvar.` }, botIds: [botId] }),
    });
    expect(saved.status).toBe(201);
    expect((await saved.json()) as TeachSaveResponse).toEqual({ name, saved: [{ botId }], failed: [] });
    expect(listSkills(botId)).toEqual([expect.objectContaining({ name, enabled: true, source: TEACH_SKILL_SOURCE })]);
    expect(readSkillFile(botId, name)).toContain("2. Confira o valor antes de salvar.");
  });

  it("answers 409 without an engine and 404 for an unknown bot", async () => {
    const work = join(mkdtempSync(join(tmpdir(), "omb-teach-test-")), "teach");
    const base = await serve({ cfg: () => ({}) as AppConfig, engines: () => [], bot: () => undefined, assignSkills: () => {}, workDir: () => work });
    const draft = await fetch(`${base}/api/teach/draft`, { method: "POST", body: JSON.stringify({ frames: [], transcript: "x", durationMs: 1 }) });
    expect(draft.status).toBe(409);
    expect(await draft.json()).toMatchObject({ code: "no-engine" });
    const save = await fetch(`${base}/api/teach/save`, { method: "POST", body: JSON.stringify({ draft: { name: "a", description: "b", body: "c" }, botIds: ["ghost"] }) });
    expect(save.status).toBe(404);
  });

  it("removes frames a crash left behind when it starts", async () => {
    const work = join(mkdtempSync(join(tmpdir(), "omb-teach-test-")), "teach");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(work, "left"), { recursive: true });
    writeFileSync(join(work, "left", "frame-000.jpg"), "x");
    createTeachTaskRoutes({ cfg: () => ({}) as AppConfig, engines: () => [], bot: () => undefined, assignSkills: () => {}, workDir: () => work });
    expect(existsSync(work)).toBe(false);
    expect(() => readFileSync(join(work, "left", "frame-000.jpg"))).toThrow();
  });
});
