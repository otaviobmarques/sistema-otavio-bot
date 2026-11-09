import { describe, expect, it, vi } from "vitest";

import type { OptionCardData } from "../../shared/wire.ts";
import "../server-line-packs.ts";
import type { Message, StoreChange } from "../store.ts";
import { cardChoices, createWhatsAppApprovals } from "./approvals.ts";

const OWNER = "5511987654321";

function fakeStore() {
  const lines = new Map<string, Message[]>();
  const listeners = new Set<(change: StoreChange) => void>();
  const emit = (change: StoreChange) => { for (const listener of listeners) listener(change); };
  let id = 0;
  return {
    onChange(listener: (change: StoreChange) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    messagesFor: (threadId: string) => lines.get(threadId) ?? [],
    bot: (botId: string) => ({ id: botId, name: botId === "b1" ? "Ana" : "Bia" }) as never,
    botByThread: (threadId: string) => (threadId.startsWith("room") ? null : { id: threadId === "t2" ? "b2" : "b1", name: "Ana" }) as never,
    groupByThread: (threadId: string) => (threadId.startsWith("room") ? { id: "g" } : null) as never,
    card(threadId: string, card: OptionCardData): Message {
      const message = { id: `m${++id}`, role: "bot", kind: "options", at: Date.now(), card } as Message;
      lines.set(threadId, [...(lines.get(threadId) ?? []), message]);
      emit({ type: "message", threadId, message });
      return message;
    },
    patch(threadId: string, messageId: string, card: OptionCardData) {
      const list = lines.get(threadId) ?? [];
      const index = list.findIndex((line) => line.id === messageId);
      list[index] = { ...list[index]!, card };
      emit({ type: "message.patch", threadId, message: list[index]! });
    },
  };
}

const permission = (requestId: string, title = "Run a command?"): OptionCardData =>
  ({ title, subtitle: "rm -rf build && TOKEN=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 npm run deploy", options: ["Allow", "Deny"], requestId, tool: "Bash" });

function setup(overrides: { allowed?: (threadId: string) => boolean; notify?: Partial<{ approvals: boolean; budget: boolean; problems: boolean }> } = {}) {
  const store = fakeStore();
  const sent: string[] = [];
  const edits: Array<{ id: string; text: string }> = [];
  const answers: Array<{ threadId: string; requestId: string; behavior: string; message?: string }> = [];
  const approvals = createWhatsAppApprovals({
    store,
    settings: () => ({ ownerNumber: OWNER, notify: { approvals: true, budget: true, problems: false, ...overrides.notify } }),
    connected: () => true,
    send: async (text) => { sent.push(text); return `w${sent.length}`; },
    edit: async (id, text) => { edits.push({ id, text }); return true; },
    answer: async (input) => {
      answers.push(input);
      const message = store.messagesFor(input.threadId).find((line) => line.card?.requestId === input.requestId);
      if (!message?.card || message.card.answered) return { ok: false, error: "The request is no longer open." };
      store.patch(input.threadId, message.id, { ...message.card, answered: input.behavior === "deny" ? "deny" : "allow" });
      return { ok: true };
    },
    companyOf: (botId) => (botId === "b1" ? "RedBox" : undefined),
    allowed: overrides.allowed ?? (() => true),
    language: () => "pt-BR",
    defer: (run) => run(),
  });
  const from = (text: string, sender = OWNER) => approvals.received({ chat: `${sender}@s.whatsapp.net`, sender, text, fromMe: false, group: false, broadcast: false });
  return { store, sent, edits, answers, approvals, from };
}

describe("a card on WhatsApp", () => {
  it("goes to the owner with its company, bot, numbered choices and a reference, with secrets redacted", () => {
    const { store, sent } = setup();
    store.card("t1", permission("r1"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("#A1 · RedBox · Ana");
    expect(sent[0]).toContain("Run a command?");
    expect(sent[0]).toContain("1 Aprovar · 2 Recusar");
    expect(sent[0]).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("answers the card through the app's own answer when the owner replies 1, and confirms", async () => {
    const { store, sent, answers, from } = setup();
    store.card("t1", permission("r1"));
    await from("1");
    expect(answers).toEqual([{ threadId: "t1", requestId: "r1", behavior: "allow" }]);
    expect(sent.at(-1)).toContain("✔ #A1: Aprovar");
    expect(store.messagesFor("t1")[0]!.card!.answered).toBe("allow");
  });

  it("reads não as decline", async () => {
    const { store, answers, from } = setup();
    store.card("t1", permission("r1"));
    await from("Não");
    expect(answers[0]).toMatchObject({ behavior: "deny" });
  });

  it("ignores other numbers, groups, broadcasts and its own messages without a word", async () => {
    const { store, sent, answers, approvals, from } = setup();
    store.card("t1", permission("r1"));
    await from("1", "5511900000000");
    await approvals.received({ chat: "123@g.us", sender: null, text: "1", fromMe: false, group: true, broadcast: false });
    await approvals.received({ chat: "status@broadcast", sender: OWNER, text: "1", fromMe: false, group: false, broadcast: true });
    await approvals.received({ chat: `${OWNER}@s.whatsapp.net`, sender: OWNER, text: "1", fromMe: true, group: false, broadcast: false });
    await approvals.received({ chat: "abc@lid", sender: null, text: "1", fromMe: false, group: false, broadcast: false });
    expect(answers).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("asks which one when several wait, and takes the reference", async () => {
    const { store, sent, answers, from } = setup();
    store.card("t1", permission("r1"));
    store.card("t2", { title: "Liberar a RedBox para continuar gastando neste mês?", subtitle: "", options: ["Liberar até o fim do mês", "Manter pausado"], requestId: "r2", tool: "company_budget", companyApproval: { kind: "budget", companyId: "co", company: "RedBox", month: "2026-11" } });
    expect(sent[1]).toContain("1 Liberar até o fim do mês · 2 Manter pausado");
    await from("1");
    expect(answers).toEqual([]);
    expect(sent.at(-1)).toContain("2 pedidos abertos: #A1, #A2");
    await from("#A2 1");
    expect(answers).toEqual([{ threadId: "t2", requestId: "r2", behavior: "allow" }]);
    await from("sim");
    expect(answers.at(-1)).toEqual({ threadId: "t1", requestId: "r1", behavior: "allow" });
  });

  it("follows a card settled in the app with a resolved line, and ignores a late reply with a notice", async () => {
    const { store, sent, edits, answers, from } = setup();
    const message = store.card("t1", permission("r1"));
    store.patch("t1", message.id, { ...message.card!, answered: "allow" });
    await Promise.resolve();
    expect(sent.at(-1)).toBe("✔ #A1 resolvido no app");
    expect(edits[0]).toMatchObject({ id: "w1" });
    expect(edits[0]!.text).toContain("✔ #A1 resolvido no app");
    await from("#A1 2");
    expect(answers).toEqual([]);
    expect(sent.at(-1)).toContain("já foi resolvido");
    await from("2");
    expect(sent.at(-1)).toBe("Nenhum pedido está esperando você agora.");
  });

  it("asks again on an answer it cannot read", async () => {
    const { store, sent, answers, from } = setup();
    store.card("t1", permission("r1"));
    await from("talvez");
    expect(answers).toEqual([]);
    expect(sent.at(-1)).toContain("responda com um número de 1 a 2");
  });

  it("sends a question's own options and answers with the option's words", async () => {
    const { store, sent, answers, from } = setup();
    store.card("t1", { title: "Qual cor?", subtitle: "Para o banner", options: ["Azul", "Verde"], requestId: "q1", requestType: "question" });
    expect(sent[0]).toContain("1 Azul · 2 Verde");
    await from("verde");
    expect(answers).toEqual([{ threadId: "t1", requestId: "q1", behavior: "answer", message: "Verde" }]);
  });

  it("sends nothing for rooms, review cards, hidden conversations or when approvals are off", () => {
    const one = setup();
    one.store.card("room1", permission("r1"));
    one.store.card("t1", { ...permission("r2"), skillRequest: {} as never });
    expect(one.sent).toEqual([]);
    const hidden = setup({ allowed: () => false });
    hidden.store.card("t1", permission("r1"));
    expect(hidden.sent).toEqual([]);
    const off = setup({ notify: { approvals: false } });
    off.store.card("t1", permission("r1"));
    expect(off.sent).toEqual([]);
  });

  it("passes on spend notices and, when chosen, a bot's trouble", () => {
    const { sent, approvals } = setup();
    approvals.notification({ kind: "spend", botId: "b1", botName: "Ana", threadId: "t1", title: "A RedBox chegou à verba de IA do mês", body: "R$ 0,16 de R$ 0,12" });
    approvals.notification({ kind: "incident", botId: "b1", botName: "Ana", threadId: "t1", title: "Parou", body: "" });
    approvals.notification({ kind: "spend", botId: "b1", botName: "Ana", threadId: "t1", title: "Só para alguém", body: "", forPerson: "p" });
    expect(sent).toEqual(["💰 A RedBox chegou à verba de IA do mês\nR$ 0,16 de R$ 0,12"]);
    const problems = setup({ notify: { problems: true } });
    problems.approvals.notification({ kind: "incident", botId: "b1", botName: "Ana", threadId: "t1", title: "Parou", body: "" });
    expect(problems.sent).toEqual(["⚠️ Ana: Parou"]);
  });
});

describe("cardChoices", () => {
  it("offers a single structured question's options and refuses a set of them", () => {
    const one = cardChoices({ title: "", subtitle: "", options: [], requestId: "q", questionRequest: { version: 1, questions: [{ question: "Onde?", options: [{ label: "Aqui" }, { label: "Lá" }] }] } }, "pt-BR");
    expect(one?.choices).toEqual(["Aqui", "Lá"]);
    expect(one?.answers[1]).toMatchObject({ behavior: "answer" });
    expect(cardChoices({ title: "", subtitle: "", options: [], requestId: "q", questionRequest: { version: 1, questions: [
      { question: "A?", options: [{ label: "1" }] }, { question: "B?", options: [{ label: "2" }] }] } }, "pt-BR")).toBeNull();
    expect(cardChoices({ ...permission("r"), answered: "allow" }, "pt-BR")).toBeNull();
  });
});

vi.setConfig({ testTimeout: 10_000 });
