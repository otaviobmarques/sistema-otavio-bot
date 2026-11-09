import { rmSync } from "node:fs";

import { z } from "zod";

import type { TeachDraftRequest } from "../../shared/teach-task.ts";
import type { AppConfig } from "../config.ts";
import { skillsLibraryEnabled } from "../skill-library.ts";
import type { BotRecord } from "../store.ts";
import { draftTeachSkill, pickTeachEngine, saveTeachSkill, type TeachEngine } from "../teach-task.ts";
import { PASS, type RouteHandler } from "./table.ts";

const DRAFT_BODY_MAX = 16 * 1024 * 1024;

const saveSchema = z.object({
  draft: z.object({ name: z.string().max(200), description: z.string().max(2000), body: z.string().max(64_000) }),
  botIds: z.array(z.string().min(1).max(200)).min(1).max(200),
});

export interface TeachTaskRouteDeps {
  cfg: () => AppConfig;
  engines: () => readonly TeachEngine[];
  bot: (id: string) => Pick<BotRecord, "id" | "modelSelection" | "assignedSkills"> | null | undefined;
  assignSkills: (botId: string, names: string[]) => void;
  /** A private folder the frames live in only while the model looks at them. */
  workDir: () => string;
}

export function createTeachTaskRoutes(deps: TeachTaskRouteDeps): RouteHandler {
  // Privacy: frames a crash left behind mid-draft never outlive the next start.
  rmSync(deps.workDir(), { recursive: true, force: true });
  return async ({ req, res, path, method, json, readBody }) => {
    if (path === "/api/teach/draft" && method === "POST") {
      const body = (await readBody(req, DRAFT_BODY_MAX)) as TeachDraftRequest & { botId?: unknown };
      const botId = typeof body?.botId === "string" ? body.botId : undefined;
      const engine = pickTeachEngine(deps.engines(), botId ? deps.bot(botId)?.modelSelection.instanceId : undefined);
      if (!engine) return json(res, 409, { error: "no connected engine can write the skill", code: "no-engine" });
      const controller = new AbortController();
      const cancel = () => controller.abort();
      res.on("close", cancel);
      try {
        const result = await draftTeachSkill({ request: body, engine, workDir: deps.workDir(), signal: controller.signal });
        if ("error" in result) return json(res, 400, result);
        return json(res, 200, result);
      } catch (error) {
        if (controller.signal.aborted) return;
        return json(res, 502, { error: error instanceof Error ? error.message : String(error), code: "engine-failed" });
      } finally {
        res.off("close", cancel);
      }
    }
    if (path === "/api/teach/save" && method === "POST") {
      const parsed = saveSchema.safeParse(await readBody(req));
      if (!parsed.success) return json(res, 400, { error: "draft and botIds are required" });
      const botIds = [...new Set(parsed.data.botIds)];
      const missing = botIds.filter((id) => !deps.bot(id));
      if (missing.length) return json(res, 404, { error: `no such bot: ${missing.join(", ")}` });
      const result = saveTeachSkill({
        draft: parsed.data.draft,
        botIds,
        libraryOn: skillsLibraryEnabled(deps.cfg()),
        assigned: (id) => deps.bot(id)?.assignedSkills,
        assign: deps.assignSkills,
      });
      if ("error" in result) return json(res, 422, result);
      return json(res, result.saved.length ? 201 : 422, result);
    }
    return PASS;
  };
}
