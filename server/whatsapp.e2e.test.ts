// The owner's WhatsApp approvals on the isolated fake-engine fixture, against a stand-in WhatsApp on this machine
// (server/testing/fake-whatsapp.ts) and a loopback stand-in for Composio: real cards (a company's budget, a send held by
// a company rule), sent to the owner's number, answered by the owner's reply through the app's own answer path. Nothing
// leaves this machine and the fixture's data is removed at the end.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";

import { launchVerificationServer, runControlOmb, verificationServerEnvironment, type VerificationServer } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";
import { startFakeWhatsApp, type FakeWhatsApp } from "./testing/fake-whatsapp.ts";

const key = "isolated-whatsapp-capability";
const OWNER = "5511987654321";
const STRANGER = "5511911112222";
let fixture: VerificationServer;
let child: ChildProcess;
let broker: Server;
let brokerOrigin = "";
let phone: FakeWhatsApp;

const api = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(fixture.info.url + path, {
    method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json() as any };
};
const control = (args: string[]) => runControlOmb([...args, "--url", fixture.info.url]) as Promise<any>;
const lines = async (thread: string) => (await api("GET", `/api/threads/${thread}/messages?limit=100`)).body.messages as any[];
const mint = async (botId: string, threadId: string) => {
  const response = await fetch(fixture.info.url + "/api/testing/internal-capability", {
    method: "POST", headers: { "content-type": "application/json", "x-openmausbot-test-capability": key }, body: JSON.stringify({ botId, threadId, kind: "connectors" }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).token as string;
};
const relay = async (token: string, args: unknown) => {
  const response = await fetch(fixture.info.url + "/api/internal/connectors/mcp", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.random(), method: "tools/call", params: { name: "GMAIL_SEND_EMAIL", arguments: args } }), signal: AbortSignal.timeout(60_000),
  });
  return await response.json() as any;
};
const sentWith = (words: string) => phone.until(() => phone.sent.find((one) => one.text.includes(words)));
const heldCard = async (thread: string) => {
  let card: any;
  await expect.poll(async () => {
    card = (await lines(thread)).findLast((line) => line.card?.outboundRequest && !line.card.answered);
    return Boolean(card);
  }, { timeout: 10_000 }).toBe(true);
  return card;
};

beforeAll(async () => {
  phone = await startFakeWhatsApp({ linkedNumber: "5511900001111" });
  broker = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/connectors/connected") return res.end(JSON.stringify({ services: { gmail: { connected: true } } }));
    if (req.url === "/api/tool_router/session/fixture-session" || req.url === "/api/tool_router/session") {
      return res.end(JSON.stringify({ session_id: "fixture-session", mcp: { type: "http", url: brokerOrigin + "/mcp" }, config: { user_id: "fixture-user", multi_account: { enable: true, max_accounts_per_toolkit: 5, require_explicit_selection: true } } }));
    }
    if (req.url === "/mcp") return res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "relay-ok" }] } }));
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
      OMB_TEST_INTERNAL_CAPABILITY_KEY: key, OMB_COMPOSIO_API: brokerOrigin + "/api", OMB_COMPOSIO_TOOLKITS_API: brokerOrigin + "/api", OMB_WHATSAPP_FAKE_URL: phone.url },
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(fixture.info.url + "/api/health")).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("isolated WhatsApp server did not start");
}, 60_000);

afterAll(async () => {
  await waitForExit(child, { signal: "SIGTERM" });
  await fixture.close();
  await new Promise<void>((resolve) => broker.close(() => resolve()));
  await phone.close();
  console.info(JSON.stringify({ logPath: fixture.info.logPath, fixtureRemoved: !existsSync(fixture.info.dataDir) }));
});

it("stays off and silent until the owner connects, then links by QR code", async () => {
  expect((await api("GET", "/api/whatsapp")).body).toEqual({ state: "off", notify: { approvals: true, budget: true, problems: false } });
  expect(phone.connected).toBe(false);
  expect((await api("PUT", "/api/whatsapp/settings", { ownerNumber: "98765-4321" })).status).toBe(400);
  expect((await api("PUT", "/api/whatsapp/settings", { ownerNumber: "+55 11 98765-4321" })).body).toMatchObject({ ownerNumber: OWNER });

  expect((await api("POST", "/api/whatsapp/connect")).status).toBe(200);
  await expect.poll(async () => (await api("GET", "/api/whatsapp")).body.state, { timeout: 10_000 }).toBe("waiting-qr");
  expect((await api("GET", "/api/whatsapp")).body.qr).toBe("2@fake-whatsapp-qr-1,fixture-only");
  phone.scan();
  await expect.poll(async () => (await api("GET", "/api/whatsapp")).body, { timeout: 10_000 }).toMatchObject({ state: "connected", linkedNumber: "5511900001111" });
  const session = join(fixture.info.dataDir, "whatsapp", "session");
  if (process.platform !== "win32") expect(statSync(session).mode & 0o777).toBe(0o700);
  if (process.platform !== "win32") expect(statSync(join(session, "creds.json")).mode & 0o777).toBe(0o600);
  if (process.platform !== "win32") expect(statSync(join(fixture.info.dataDir, "whatsapp", "settings.json")).mode & 0o777).toBe(0o600);
}, 60_000);

it("sends each card to the owner, answers the right one by reference, ignores anyone else and late replies", async () => {
  const ana = (await api("POST", "/api/bots", { name: "Ana" })).body.bot;
  expect((await api("POST", "/api/sidebar-sections", { name: "Criação", botIds: [ana.id] })).status).toBeLessThan(300);
  const redbox = (await api("POST", "/api/companies", { name: "RedBox", monthlyBudgetBrl: 0.12, departmentIds: ["Criação"] })).body.company;
  for (const text of ["um", "dois", "três"]) {
    expect((await api("POST", `/api/bots/${ana.id}/messages`, { text })).status).toBeLessThan(300);
    expect(JSON.stringify(await control(["wait", "--bot", ana.id, "--timeout", "30"]))).toContain("settled");
  }
  await sentWith("💰 A RedBox chegou à verba de IA do mês");
  expect((await api("POST", `/api/bots/${ana.id}/messages`, { text: "quatro" })).status).toBe(409);
  const budget = await sentWith("Liberar a RedBox para continuar gastando neste mês?");
  expect(budget.to).toBe(OWNER);
  expect(budget.text).toContain("#A1 · RedBox · Ana");
  expect(budget.text).toContain("1 Liberar até o fim do mês · 2 Manter pausado");

  const before = phone.sent.length;
  phone.receive({ sender: STRANGER, text: "1" });
  phone.receive({ sender: OWNER, chat: "120363000000000000@g.us", text: "1", group: true });
  phone.receive({ sender: OWNER, chat: "status@broadcast", text: "1", broadcast: true });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(phone.sent.length).toBe(before);
  expect((await api("GET", "/api/companies")).body.companies[0].budgetReleasedMonth).toBeFalsy();

  const bia = (await api("POST", "/api/bots", { name: "Bia" })).body.bot;
  expect((await api("PATCH", `/api/bots/${bia.id}`, { outbound: { policy: "allow" } })).status).toBe(200);
  expect((await api("POST", "/api/sidebar-sections", { name: "Tráfego pago", botIds: [bia.id] })).status).toBeLessThan(300);
  expect((await api("POST", "/api/companies", { name: "Vertice", departmentIds: ["Tráfego pago"], rules: [{ trigger: "bulk-send", threshold: 1 }] })).status).toBe(201);
  const token = await mint(bia.id, bia.threadId);
  const held = relay(token, { recipient_email: "a@cliente.test", cc: ["b@cliente.test"] });
  const sendCard = await heldCard(bia.threadId);
  const outbound = await sentWith("#A2 · Vertice · Bia");
  expect(outbound.text).toContain("1 Aprovar · 2 Recusar");

  let count = phone.sent.length;
  phone.receive({ sender: OWNER, text: "1" });
  expect((await phone.sentAfter(count)).text).toContain("Você tem 2 pedidos abertos: #A1, #A2");

  count = phone.sent.length;
  phone.receive({ sender: "+55 11 98765-4321", text: "#A2 não" });
  expect((await phone.sentAfter(count)).text).toBe("✔ #A2: Recusar. Feito, igual a no app.");
  expect((await held).result.isError).toBe(true);
  const denied = (await lines(bia.threadId)).find((line) => line.card?.requestId === sendCard.card.requestId).card;
  expect(denied).toMatchObject({ answered: "deny", answeredBy: { kind: "loopback", via: "whatsapp" } });

  count = phone.sent.length;
  phone.receive({ sender: OWNER, text: "1" });
  expect((await phone.sentAfter(count)).text).toBe("✔ #A1: Liberar até o fim do mês. Feito, igual a no app.");
  expect((await api("GET", "/api/companies")).body.companies.find((one: any) => one.id === redbox.id).budgetReleasedMonth).toBe(new Date().toISOString().slice(0, 7));

  const second = relay(token, { recipient_email: "c@cliente.test", cc: ["d@cliente.test"] });
  const tapped = await heldCard(bia.threadId);
  await sentWith("#A3 · Vertice · Bia");
  count = phone.sent.length;
  expect((await api("POST", `/api/threads/${bia.threadId}/respond`, { requestId: tapped.card.requestId, behavior: "allow" })).status).toBe(200);
  expect((await phone.sentAfter(count)).text).toBe("✔ #A3 resolvido no app");
  expect((await second).result.isError, JSON.stringify(await second)).not.toBe(true);
  await phone.until(() => phone.edits.find((edit) => edit.text.includes("✔ #A3 resolvido no app")));
  count = phone.sent.length;
  phone.receive({ sender: OWNER, text: "#A3 2" });
  expect((await phone.sentAfter(count)).text).toBe("O #A3 já foi resolvido, então nada foi feito com esta resposta.");

  const activity = (await api("GET", "/api/admin-activity?what=approvals")).body.entries as any[];
  expect(activity.filter((entry) => entry.via === "whatsapp").map((entry) => entry.what).sort()).toEqual(["user-approved", "user-denied"]);
  const log = readFileSync(fixture.info.logPath, "utf8");
  expect(log).not.toContain("2@fake-whatsapp-qr");
}, 240_000);

it("unlinks the phone and erases the session on Disconnect", async () => {
  expect((await api("POST", "/api/whatsapp/disconnect")).body).toMatchObject({ state: "off" });
  await phone.until(() => phone.loggedOut);
  expect(existsSync(join(fixture.info.dataDir, "whatsapp", "session"))).toBe(false);
}, 30_000);
