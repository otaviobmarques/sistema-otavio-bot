import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creditRefusalKind, GATEWAY_REFUSED } from "../shared/trial-credit.ts";
import type { RuntimeEvent } from "./contracts.ts";
import { DATA_DIR, WORKSPACE_CREDENTIAL_ENV } from "./config.ts";
import { CLOUD_HOME_SECRET_KEYS } from "./cloud-secrets.ts";
import { ProviderRegistry } from "./harness/registry.ts";
import { arkoGatewayConnection, startArkoGateway } from "./hosted-models.ts";
import { aiGatewayCredential, INCLUDED_TOKEN_ENV, type ServiceCredential } from "./included-services.ts";
import { companyInstanceConfigs, companyInstanceId, ManagedDesktopProviders, type ManagedDesktopConnection } from "./managed-desktop.ts";
import { makeFakeDriver } from "./testing/fake-driver.ts";
import { gatewayRefusal } from "./trial-credit.ts";

const TOKEN = `arko_ai_${randomBytes(32).toString("base64url")}`;
const GATEWAY = "https://ia.arkobot.test";
const ORG = "33333333-3333-4333-8333-333333333333";
const credential: ServiceCredential = { api: GATEWAY, token: TOKEN, included: true };
const catalog = {
  object: "list", plan: "essencial", usable: true, organization: { id: ORG, name: "Padaria Pão Quente" },
  data: [
    { id: "claude-haiku-4-5", provider: "anthropic", display_name: "Claude Haiku 4.5" },
    { id: "gpt-5-mini", provider: "openai" },
    { id: "google/gemini-2.5-flash", provider: "openrouter" },
  ],
};

const managers: ManagedDesktopProviders[] = [], registries: ProviderRegistry[] = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map(manager => manager.close()));
  await Promise.all(registries.splice(0).map(registry => registry.disposeAll()));
  vi.useRealTimers();
});

async function setup() {
  const fakes = ["claudeAgent", "codex", "openai-compat"].map(kind => makeFakeDriver({ kind }));
  const registry = new ProviderRegistry(fakes.map(fake => fake.driver), { npmAvailable: () => false }); registries.push(registry);
  await registry.load({ personal: { driver: "claudeAgent" } });
  const manager = new ManagedDesktopProviders({ registry, dataDirectory: join(DATA_DIR, `arko-gateway-${randomUUID()}`) }); managers.push(manager);
  return { registry, manager, fakes };
}

describe("ArkoBot gateway credential", () => {
  it("takes an https (or loopback) gateway and an arko_ai_ token, and holds the token like the other included ones", () => {
    expect(aiGatewayCredential({ OMB_CLOUD_AI_GATEWAY_URL: `${GATEWAY}/`, OMB_CLOUD_AI_GATEWAY_TOKEN: TOKEN })).toEqual({ api: GATEWAY, token: TOKEN, included: true });
    expect(aiGatewayCredential({ OMB_CLOUD_AI_GATEWAY_URL: "http://127.0.0.1:8791", OMB_CLOUD_AI_GATEWAY_TOKEN: TOKEN })?.api).toBe("http://127.0.0.1:8791");
    expect(aiGatewayCredential({ OMB_CLOUD_AI_GATEWAY_URL: "http://ia.arkobot.test", OMB_CLOUD_AI_GATEWAY_TOKEN: TOKEN })).toBeNull();
    expect(aiGatewayCredential({ OMB_CLOUD_AI_GATEWAY_URL: GATEWAY, OMB_CLOUD_AI_GATEWAY_TOKEN: "sk-ant-pessoal" })).toBeNull();
    expect(aiGatewayCredential({ OMB_CLOUD_AI_GATEWAY_URL: GATEWAY })).toBeNull();
    expect(INCLUDED_TOKEN_ENV).toContain("OMB_CLOUD_AI_GATEWAY_TOKEN");
    expect(WORKSPACE_CREDENTIAL_ENV).toContain("OMB_CLOUD_AI_GATEWAY_TOKEN");
    expect(CLOUD_HOME_SECRET_KEYS).toContain("OMB_CLOUD_AI_GATEWAY_TOKEN");
  });
});

describe("ArkoBot gateway engines", () => {
  it("points Claude Code, Codex and the OpenAI-compatible engine at the gateway with the instance token", () => {
    const value = arkoGatewayConnection(credential, catalog);
    expect(value.providers).toEqual([
      { id: "anthropic", configured: true, models: ["claude-haiku-4-5"] },
      { id: "openai", configured: true, models: ["gpt-5-mini"] },
      { id: "openrouter", configured: true, models: ["google/gemini-2.5-flash"] },
    ]);
    const map = companyInstanceConfigs(value, "/fixture/runtime");
    const claude = map[companyInstanceId(value, "anthropic")]!, codex = map[companyInstanceId(value, "openai")]!, router = map[companyInstanceId(value, "openrouter")]!;
    expect(claude.displayName).toBe("ArkoBot · Claude");
    expect(claude.environment).toMatchObject({ ANTHROPIC_BASE_URL: `${GATEWAY}/v1/anthropic`, ANTHROPIC_API_KEY: TOKEN, ANTHROPIC_AUTH_TOKEN: TOKEN });
    expect(codex.config).toEqual({ managed: { url: `${GATEWAY}/v1/openai/v1`, models: ["gpt-5-mini"] } });
    expect(router.config).toMatchObject({ url: `${GATEWAY}/v1/openrouter/v1`, apiKeyEnv: "OPENMAUSBOT_COMPANY_API_KEY", model: "google/gemini-2.5-flash" });
    expect(() => arkoGatewayConnection(credential, { data: [] })).toThrow();
  });

  it("sits beside the owner's own engine without enrolling the server in a company", async () => {
    const { registry, manager } = await setup();
    await manager.applyConnection(arkoGatewayConnection(credential, catalog));
    expect(registry.instances()).toHaveLength(4);
    expect(registry.get("personal")).toBeDefined();
    expect(manager.enrolled()).toBe(false);
    const id = companyInstanceId(arkoGatewayConnection(credential, catalog), "anthropic");
    const claude = registry.get(id)!;
    expect(manager.owns(id)).toBe(true);
    expect(claude.models.options).toEqual([{ id: "claude-haiku-4-5", label: "claude-haiku-4-5" }]);
    expect(await claude.snapshot()).toMatchObject({ billing: "metered", authenticated: true });
    expect((await claude.snapshot()).account).toBeUndefined();
    expect(JSON.stringify(await registry.describe())).not.toContain(TOKEN);
  });

  it("turns the gateway's 402/403 bodies into the plain note the chat shows", async () => {
    const { registry, manager, fakes } = await setup();
    const value = arkoGatewayConnection(credential, catalog);
    await manager.applyConnection(value);
    const seen: RuntimeEvent[] = [];
    const id = companyInstanceId(value, "anthropic");
    registry.get(id)!.adapter.onEvent(event => seen.push(event));
    const emit = fakes[0]!.created.get(id)!.emit;
    emit({ type: "runtime.error", threadId: "t", message: `API Error: 402 {"code":"credits_used_up","message":"Os créditos de IA desta conta acabaram.","type":"error"}` } as RuntimeEvent);
    emit({ type: "runtime.error", threadId: "t", message: "upstream HTTP 503: provider down" } as RuntimeEvent);
    expect(seen[0]).toMatchObject({ type: "runtime.error", message: GATEWAY_REFUSED.credits_used_up, setup: true });
    expect(seen[1]).toMatchObject({ message: "upstream HTTP 503: provider down" });
    expect(creditRefusalKind(GATEWAY_REFUSED.credits_used_up)).toBe("credits_used_up");
  });

  it("reads the plan's catalog at start, keeps it fresh, and drops the engines when the token is revoked", async () => {
    vi.useFakeTimers();
    const apply = vi.fn<(connection: ManagedDesktopConnection | null) => Promise<void>>(async () => {});
    const answers = [
      () => new Response(JSON.stringify(catalog), { status: 200, headers: { "content-type": "application/json" } }),
      () => new Response(JSON.stringify({ code: "invalid_token" }), { status: 401 }),
    ];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${GATEWAY}/v1/models`);
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
      return answers.shift()!();
    }) as unknown as typeof fetch;
    const started = startArkoGateway({ credential, providers: { applyConnection: apply }, fetch: fetcher });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0]![0]).toMatchObject({ gateway: GATEWAY, organizationId: ORG, token: TOKEN });
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
    expect(apply.mock.calls[1]![0]).toBeNull();
    started!.stop();
    expect(startArkoGateway({ credential: null, providers: { applyConnection: apply } })).toBeNull();
  });
});

describe("gateway refusals in engine errors", () => {
  it("finds the gateway's code however the engine quotes the body", () => {
    expect(gatewayRefusal('API Error: 402 {"code":"credits_used_up","message":"…"}')).toBe("credits_used_up");
    expect(gatewayRefusal('unexpected status 402 Payment Required: {"code": "plan_suspended"}')).toBe("plan_suspended");
    expect(gatewayRefusal('upstream HTTP 403: {"type":"error","error":{"type":"model_not_in_plan"}}')).toBe("model_not_in_plan");
    expect(gatewayRefusal('{"code":"daily_cap_reached"}')).toBe("plan_limit");
    expect(gatewayRefusal("upstream HTTP 402: Os créditos de IA desta conta acabaram. (credits_used_up)")).toBe("credits_used_up");
    expect(gatewayRefusal('401 {"code":"invalid_token"}')).toBe("unavailable");
    expect(gatewayRefusal("upstream HTTP 402: Payment Required")).toBeNull();
    expect(gatewayRefusal('{"error":{"type":"rate_limit_error"}}')).toBeNull();
    for (const text of Object.values(GATEWAY_REFUSED)) expect(creditRefusalKind(text)).not.toBeNull();
    expect(creditRefusalKind("something else")).toBeNull();
  });
});
