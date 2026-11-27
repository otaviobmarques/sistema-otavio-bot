import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { openaiChatStream } from "./fake-ai.ts";
import { addProviderKey, gatewayFixture, HOSTS, type GatewayFixture } from "./gateway-fixture.ts";
import { testContext } from "./helpers.ts";

const ESSENCIAL = ["claude-haiku-5-5", "gpt-5.4-mini", "google/gemini-2.5-flash"];
const PROFISSIONAL = [...ESSENCIAL, "claude-sonnet-5", "gpt-5.4", "google/gemini-3.1-pro-preview"];
const EMPRESA = [...PROFISSIONAL, "claude-opus-5", "gpt-5.5", "x-ai/grok-4.7"];

describe("modelos dos planos pagos", () => {
  let f: GatewayFixture | null = null;
  afterEach(async () => {
    await f?.ctx.db.close();
    f = null;
  });

  it("a 0011 põe GPT e Gemini nos planos pagos, só com ids da tabela de preços, e pode rodar de novo", async () => {
    const ctx = await testContext();
    const read = () => ctx.db.query<{ code: string; allowed_models: string[]; default_model: string | null; idle_sleep_minutes: number | null }>(
      "SELECT code, allowed_models, default_model, idle_sleep_minutes FROM plans ORDER BY sort_order");
    const plans = Object.fromEntries((await read()).rows.map((row) => [row.code, row]));
    expect(plans.essencial).toMatchObject({ allowed_models: ESSENCIAL, default_model: "claude-haiku-5-5", idle_sleep_minutes: null });
    expect(plans.profissional).toMatchObject({ allowed_models: PROFISSIONAL, default_model: "claude-sonnet-5" });
    expect(plans.empresa).toMatchObject({ allowed_models: EMPRESA, default_model: "claude-sonnet-5" });
    expect(plans.inicial!.idle_sleep_minutes).toBe(30);
    expect(plans.inicial!.allowed_models.every((model) => model.startsWith("gratis/"))).toBe(true);
    const priced = new Set((await ctx.db.query<{ model: string }>("SELECT model FROM model_prices")).rows.map((row) => row.model));
    expect(EMPRESA.filter((model) => !priced.has(model))).toEqual([]);
    expect(EMPRESA.some((model) => model.endsWith("-4-5"))).toBe(false);

    const before = (await read()).rows;
    const sql = readFileSync(new URL("../migrations/0011_dormir_avisos_ias.sql", import.meta.url), "utf8");
    await ctx.db.query(sql);
    await migrate(ctx.db);
    expect((await read()).rows).toEqual(before);
    await ctx.db.close();
  });

  it("o gateway só oferece um modelo pago quando o provedor dele tem chave ativa em Integrações", async () => {
    const ctx = await testContext();
    await addProviderKey(ctx, "anthropic", `https://${HOSTS.anthropic}`);
    f = await gatewayFixture({ ctx, planCode: "empresa", credits: 4000 });
    const catalog = async () => (await (await f!.gateway.app.request("/v1/models", { headers: { authorization: `Bearer ${f!.token}` } })).json()).data
      .map((model: { id: string }) => model.id).sort();
    expect(await catalog()).toEqual(["claude-haiku-5-5", "claude-opus-5", "claude-sonnet-5"]);

    const refused = await f.call("/v1/openai/v1/chat/completions", { model: "gpt-5.4", stream: true, messages: [] });
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("model_unavailable");
    expect(f.ai.calls).toHaveLength(0);
    expect((await f.ctx.db.query("SELECT 1 FROM credit_reservations")).rows).toHaveLength(0);
    expect(await f.wallet()).toMatchObject({ plan: 4000 });

    // The owner adds an OpenAI key: GPT shows up and answers. A disabled OpenRouter key changes nothing.
    await addProviderKey(f.ctx, "openai", `https://${HOSTS.openai}`);
    const openrouter = await addProviderKey(f.ctx, "openrouter", `https://${HOSTS.openrouter}`);
    await f.ctx.db.query("UPDATE ai_provider_keys SET enabled = false WHERE id = $1", [openrouter]);
    expect(await catalog()).toEqual(["claude-haiku-5-5", "claude-opus-5", "claude-sonnet-5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.5"]);
    f.ai.next(HOSTS.openai, () => openaiChatStream({ prompt: 100, completion: 10 }));
    const answered = await f.call("/v1/openai/v1/chat/completions", { model: "gpt-5.4", stream: true, messages: [] });
    expect(answered.status).toBe(200);
    await answered.text();
    await f.gateway.drain();

    await f.ctx.db.query("UPDATE ai_provider_keys SET enabled = true WHERE id = $1", [openrouter]);
    expect(await catalog()).toEqual(expect.arrayContaining(["google/gemini-2.5-flash", "google/gemini-3.1-pro-preview", "x-ai/grok-4.7"]));
  });
});
