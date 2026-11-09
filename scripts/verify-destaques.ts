// Destaques and figurinhas in the real app, against a disposable fake-engine server; never the live app.
// Run: node --experimental-strip-types scripts/verify-destaques.ts
// It seeds one bot whose reply waits unread (green), one whose engine asks the person a question and waits (amber), one
// whose engine is signed out (red), and two quiet bots, then prints the preview's address and waits for Ctrl-C.
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";
import { fixtureApi, mountPreview, parkUntilSignal, type MountedPreview } from "./testing/preview-fixture.ts";

const BOTS = [
  { name: "Duda", title: "Copy", color: "pink" },
  { name: "Téo", title: "Propostas", color: "orange" },
  { name: "Gui", title: "Dev", color: "teal" },
  { name: "Otávio", title: "Designer", color: "red" },
  { name: "Max", title: "Google Ads", color: "blue" },
  { name: "Lia", title: "Roteirista", color: "purple" },
] as const;

const fixture = await launchVerificationServer();
console.error(`fixture log: ${fixture.info.logPath}`);
let ui: MountedPreview | undefined;
try {
  const api = fixtureApi(fixture.info.url, { headers: { origin: fixture.info.url } });
  await api("PATCH", "/api/config", { language: "pt-br" });
  for (const bot of BOTS) await runControlOmb(["new-bot", "--name", bot.name, "--url", fixture.info.url]);
  const { bots } = await api("GET", "/api/bots?messages=0") as { bots: Array<{ id: string; name: string; threadId: string }> };
  const ids = Object.fromEntries(BOTS.map((bot) => [bot.name, bots.find((candidate) => candidate.name === bot.name)!.id]));
  for (const bot of BOTS) await api("PATCH", `/api/bots/${ids[bot.name]}`, { color: bot.color, title: bot.title });
  await api("PATCH", `/api/bots/${ids["Téo"]}`, { approvalMode: "ask" });
  await api("POST", "/api/sidebar-sections", { name: "FoodX", botIds: [ids["Max"], ids["Lia"]] });

  // Each engine process reads the behaviour its bot needs when it starts.
  const modeFile = join(fixture.info.dataDir, "destaques-mode.json");
  const wrapper = join(fixture.info.dataDir, "destaques-claude.mjs");
  const fake = pathToFileURL(fileURLToPath(new URL("../server/testing/fake-claude-cli.ts", import.meta.url))).href;
  writeFileSync(wrapper, ["#!/usr/bin/env node", 'import { readFileSync } from "node:fs";',
    `Object.assign(process.env, JSON.parse(readFileSync(${JSON.stringify(modeFile)}, "utf8")));`, `await import(${JSON.stringify(fake)});`].join("\n"));
  chmodSync(wrapper, 0o755);
  await api("PATCH", "/api/instances/claude", { cli: wrapper });

  const settled = async (botId: string, done: (bot: { busy?: boolean; activity?: string }) => boolean) => {
    let last: unknown;
    for (let i = 0; i < 120; i++) {
      const { bots: now } = await api("GET", "/api/bots?messages=0") as { bots: Array<{ id: string; busy?: boolean; activity?: string }> };
      last = now.find((bot) => bot.id === botId)!;
      if (done(last as { busy?: boolean; activity?: string })) return;
      await delay(250);
    }
    const { bots: full } = await api("GET", "/api/bots") as { bots: Array<{ id: string; messages?: unknown[] }> };
    throw new Error(`${botId} never settled: ${JSON.stringify(full.find((bot) => bot.id === botId)?.messages ?? []).slice(0, 3000)}`);
  };
  const turn = async (name: string, mode: Record<string, string>, text: string, done: (bot: { busy?: boolean; activity?: string }) => boolean) => {
    writeFileSync(modeFile, JSON.stringify(mode));
    await api("POST", `/api/bots/${ids[name]}/messages`, { text });
    await settled(ids[name]!, done);
  };

  await turn("Duda", { FAKE_CLAUDE_REPLIES: JSON.stringify(["Os 4 anúncios da Academia estão prontos para revisão."]), FAKE_CLAUDE_TOOL_CALLS: "[]" },
    "Escreva os anúncios da Academia", (bot) => !bot.busy);
  await turn("Téo", {
    FAKE_CLAUDE_MODE: "hang",
    FAKE_CLAUDE_ELICIT: JSON.stringify({ mcp_server_name: "whatsapp", message: "Posso enviar a proposta para 12 restaurantes?", mode: "form", requested_schema: { type: "object", properties: {} } }),
  }, "Mande a proposta padrão para os restaurantes", (bot) => bot.activity === "waiting-on-you");
  await turn("Otávio", { FAKE_CLAUDE_MODE: "not-logged-in" }, "Abra o Canva e exporte as artes", (bot) => !bot.busy);
  await turn("Gui", { FAKE_CLAUDE_REPLIES: JSON.stringify(["Deploy feito."]), FAKE_CLAUDE_TOOL_CALLS: "[]" }, "Faça o deploy", (bot) => !bot.busy);
  // The signed-out turn also sends the helper bot an incident report, a moment later; reading it leaves only the seeded bots.
  await delay(3000);
  const spoke = new Set(["Duda", "Téo", "Otávio"].map((name) => ids[name]));
  for (const bot of (await api("GET", "/api/bots?messages=0") as { bots: Array<{ id: string; tasks?: Array<{ threadId: string; unread?: boolean }> }> }).bots) {
    await api("PATCH", `/api/bots/${bot.id}`, { unread: spoke.has(bot.id) });
    if (spoke.has(bot.id)) continue;
    for (const task of bot.tasks ?? []) if (task.unread) await api("POST", `/api/bots/${bot.id}/read`, { threadId: task.threadId });
  }

  ui = await mountPreview(fixture, { entry: "/scripts/testing/sidebar-groups-preview.tsx", route: "/__destaques.html", title: "Isolated Destaques", logLevel: "warn" });
  console.log(JSON.stringify({ ...fixture.info, previewUrl: ui.previewUrl, ids }, null, 2));
  await parkUntilSignal();
} finally {
  await ui?.close();
  await fixture.close();
}
