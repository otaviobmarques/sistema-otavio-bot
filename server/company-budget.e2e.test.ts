// A company's budget and approval rules on the isolated fake-engine fixture: real turns booked at the fake engine's $0.01
// each, a loopback stand-in for Composio, and nothing outside this machine. The fixture's data is removed at the end.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";

import { launchVerificationServer, runControlOmb, verificationServerEnvironment, type VerificationServer } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";
import { openSse } from "./testing/sse.ts";

const key = "isolated-company-capability";
let fixture: VerificationServer;
let child: ChildProcess;
let broker: Server;
let brokerOrigin = "";
const relayed: unknown[] = [];

const api = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(fixture.info.url + path, {
    method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json() as any };
};
const control = (args: string[]) => runControlOmb([...args, "--url", fixture.info.url]) as Promise<any>;
const cards = async (thread: string) => (await api("GET", `/api/threads/${thread}/messages?limit=100`)).body.messages as any[];
const mint = async (botId: string, threadId: string) => {
  const response = await fetch(fixture.info.url + "/api/testing/internal-capability", {
    method: "POST", headers: { "content-type": "application/json", "x-openmausbot-test-capability": key }, body: JSON.stringify({ botId, threadId, kind: "connectors" }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).token as string;
};
const relay = async (token: string, name: string, args: unknown) => {
  const response = await fetch(fixture.info.url + "/api/internal/connectors/mcp", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.random(), method: "tools/call", params: { name, arguments: args } }), signal: AbortSignal.timeout(20_000),
  });
  return await response.json() as any;
};

beforeAll(async () => {
  broker = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/connectors/connected") return res.end(JSON.stringify({ services: { gmail: { connected: true } } }));
    if (req.url === "/api/tool_router/session/fixture-session" || req.url === "/api/tool_router/session") {
      return res.end(JSON.stringify({ session_id: "fixture-session", mcp: { type: "http", url: brokerOrigin + "/mcp" }, config: { user_id: "fixture-user", multi_account: { enable: true, max_accounts_per_toolkit: 5, require_explicit_selection: true } } }));
    }
    if (req.url === "/mcp") {
      relayed.push(body);
      return res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "relay-ok" }] } }));
    }
    return res.end(JSON.stringify({ items: [{ slug: "gmail", connected_account: { id: "fixture-account", status: "ACTIVE" } }] }));
  });
  await new Promise<void>((resolve) => broker.listen(0, "127.0.0.1", resolve));
  brokerOrigin = `http://127.0.0.1:${(broker.address() as { port: number }).port}`;
  fixture = await launchVerificationServer();
  await waitForExit(fixture.child, { signal: "SIGTERM" });
  const configFile = join(fixture.info.dataDir, "config.json");
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  config.language = "pt-br";
  config.composio = { apiKey: "ak_isolated_fixture", userId: "fixture-user", sessionId: "fixture-session" };
  writeFileSync(configFile, JSON.stringify(config));
  const log = openSync(fixture.info.logPath, "a", 0o600);
  child = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./index.ts", import.meta.url))], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...verificationServerEnvironment({}, fixture.info.dataDir, Number(new URL(fixture.info.url).port)),
      OMB_TEST_INTERNAL_CAPABILITY_KEY: key, OMB_COMPOSIO_API: brokerOrigin + "/api", OMB_COMPOSIO_TOOLKITS_API: brokerOrigin + "/api" },
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(fixture.info.url + "/api/health")).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("isolated company server did not start");
}, 60_000);

afterAll(async () => {
  await waitForExit(child, { signal: "SIGTERM" });
  await fixture.close();
  await new Promise<void>((resolve) => broker.close(() => resolve()));
  console.info(JSON.stringify({ logPath: fixture.info.logPath, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
});

it("warns at 80%, pauses the company's bots at 100% with a release card in the inbox, and lets them on once released", async () => {
  const { bot } = (await api("POST", "/api/bots", { name: "Ana" })).body;
  const other = (await api("POST", "/api/bots", { name: "Solta" })).body.bot;
  expect((await api("POST", "/api/sidebar-sections", { name: "Criação", botIds: [bot.id] })).status).toBeLessThan(300);
  // Each fake turn books $0.01, R$ 0,055 at the default rate: two turns are 91% of R$ 0,12 and the third spends it.
  const created = await api("POST", "/api/companies", { name: "RedBox", monthlyBudgetBrl: 0.12, departmentIds: ["Criação"] });
  expect(created.status).toBe(201);
  const company = created.body.company;
  const events = await openSse(`${fixture.info.url}/api/events`);
  const send = (botId: string, text: string) => api("POST", `/api/bots/${botId}/messages`, { text });
  try {
    for (const text of ["um", "dois", "três"]) {
      expect((await send(bot.id, text)).status).toBeLessThan(300);
      expect(JSON.stringify(await control(["wait", "--bot", bot.id, "--timeout", "30"]))).toContain("settled");
    }
    await events.until((frame) => frame.kind === "notify" && frame.notification?.title === "A RedBox chegou à verba de IA do mês", 20_000);
    const spendTitles = events.frames.filter((frame) => frame.kind === "notify" && frame.notification?.kind === "spend").map((frame) => frame.notification.title);
    expect(spendTitles).toEqual(["A RedBox já usou 91% da verba de IA", "A RedBox chegou à verba de IA do mês"]);
  } finally {
    events.close();
  }
  const spend = (await api("GET", "/api/companies/spend")).body.spend;
  expect(spend).toEqual([expect.objectContaining({ companyId: company.id, budgetBrl: 0.12, usdToBrl: 5.5, level: "exceeded", released: false })]);
  expect(spend[0].spentUsd).toBeCloseTo(0.03, 6);
  expect(spend[0].spentBrl).toBeCloseTo(0.165, 6);

  const refused = await send(bot.id, "quatro");
  expect(refused.status).toBe(409);
  expect(refused.body.code).toBe("spend_cap");
  expect(refused.body.error.replace(/\s/g, " ")).toBe("Os bots da RedBox estão pausados: a verba de IA deste mês acabou (R$ 0,16 de R$ 0,12). Libere o mês na Caixa de entrada ou na Sala do conselho, ou aumente a verba no Prédio.");
  expect((await send(other.id, "fora da empresa")).status).toBeLessThan(300);
  expect(JSON.stringify(await control(["wait", "--bot", other.id, "--timeout", "30"]))).toContain("settled");
  expect((await send(bot.id, "cinco")).status).toBe(409);

  const open = (await cards(bot.threadId)).filter((line) => line.card?.companyApproval);
  expect(open).toHaveLength(1);
  expect(open[0].card).toMatchObject({ title: "Liberar a RedBox para continuar gastando neste mês?", options: ["Liberar até o fim do mês", "Manter pausado"],
    companyApproval: { kind: "budget", companyId: company.id, company: "RedBox" } });
  const inbox = (await api("GET", "/api/inbox")).body;
  const row = inbox.rows.find((one: any) => one.card?.requestId === open[0].card.requestId);
  expect(row).toMatchObject({ kind: "ask", tab: "needs-you", from: { botId: bot.id } });

  expect((await api("POST", `/api/threads/${bot.threadId}/respond`, { requestId: open[0].card.requestId, behavior: "allow" })).body).toMatchObject({ ok: true, outcome: "allowed-once" });
  const released = (await api("GET", "/api/companies")).body.companies[0];
  expect(released.budgetReleasedMonth).toBe(new Date().toISOString().slice(0, 7));
  expect((await api("GET", "/api/companies/spend")).body.spend[0]).toMatchObject({ level: "exceeded", released: true });
  expect((await send(bot.id, "seis")).status).toBeLessThan(300);
  expect(JSON.stringify(await control(["wait", "--bot", bot.id, "--timeout", "30"]))).toContain("settled");
}, 180_000);

it("holds a send to more contacts than a company rule allows, though its bot sends without asking, and tells its bots the rules", async () => {
  const { bot } = (await api("POST", "/api/bots", { name: "Bia" })).body;
  expect((await api("PATCH", `/api/bots/${bot.id}`, { outbound: { policy: "allow" } })).status).toBe(200);
  expect((await api("POST", "/api/sidebar-sections", { name: "Tráfego pago", botIds: [bot.id] })).status).toBeLessThan(300);
  const created = await api("POST", "/api/companies", { name: "Vertice", departmentIds: ["Tráfego pago"],
    rules: [{ trigger: "bulk-send", threshold: 2 }, { trigger: "deploy" }] });
  expect(created.status).toBe(201);
  const company = created.body.company;
  const token = await mint(bot.id, bot.threadId);

  const before = relayed.length;
  const first = await relay(token, "GMAIL_SEND_EMAIL", { recipient_email: "a@cliente.test", cc: ["b@cliente.test"] });
  expect(first.result, JSON.stringify(first)).toBeDefined();
  expect(first.result.isError, JSON.stringify(first)).not.toBe(true);
  expect(relayed).toHaveLength(before + 1);
  expect((await cards(bot.threadId)).filter((line) => line.card?.outboundRequest)).toEqual([]);

  const held = relay(token, "GMAIL_SEND_EMAIL", { recipient_email: "a@cliente.test", cc: ["b@cliente.test", "c@cliente.test"] });
  let card: any;
  await expect.poll(async () => {
    card = (await cards(bot.threadId)).findLast((line) => line.card?.outboundRequest && !line.card.answered);
    return Boolean(card);
  }, { timeout: 10_000 }).toBe(true);
  expect(card.card.companyApproval).toEqual({ kind: "rule", companyId: company.id, company: "Vertice", rules: [company.rules[0]] });
  expect(relayed).toHaveLength(before + 1);
  const inbox = (await api("GET", "/api/inbox")).body;
  expect(inbox.rows.find((one: any) => one.card?.requestId === card.card.requestId)?.card.companyApproval.company).toBe("Vertice");
  await api("POST", `/api/threads/${bot.threadId}/respond`, { requestId: card.card.requestId, behavior: "deny" });
  expect((await held).result.isError).toBe(true);
  expect(relayed).toHaveLength(before + 1);

  const prompt = JSON.stringify((await api("GET", `/api/bots/${bot.id}/system-prompt`)).body);
  expect(prompt).toContain("Approval rules the owner set for the company \\\"Vertice\\\"");
  expect(prompt).toContain("Change anything in production or deploy");
}, 120_000);
