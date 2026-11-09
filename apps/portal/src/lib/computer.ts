import { botMemory, botSkills, companies, computers, type Bot, type ComputerData } from "../data/mock";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

export function computerFor(bot: Bot): ComputerData {
  const known = computers[bot.id];
  if (known) return known;
  const company = companies.find((c) => c.id === bot.companyId);
  const container = `${company ? slug(company.name) : "diretoria"}-${slug(bot.role)}`;
  return {
    url: bot.id === "gui" ? "github.com/domma/domma-sistema/pull/142" : "app.otaviobot.local/painel",
    profile: `perfil: ${slug(bot.name)}@${company ? slug(company.name) : "diretoria"} · só este bot`,
    container: `${bot.model} · container Docker \`${container}\` · Ubuntu 24.04 · Chromium com perfil próprio · 0,8 GB em uso`,
    tabs: ["Tela ao vivo", "Terminal", "Arquivos", "Logins do bot", "Auditoria"],
    terminal: [`$ cd ~/trabalho`, `$ ls`, `notas.md   tarefas.json`, `[gateway] sessão iniciada para ${bot.name} (${bot.role})`],
    files: [
      { name: "trabalho/", depth: 0, kind: "folder" },
      { name: "notas.md", depth: 1, kind: "file" },
      { name: "tarefas.json", depth: 1, kind: "file" },
      { name: "compartilhado/", depth: 0, kind: "shared", note: company?.name ?? "Diretoria" },
    ],
    logins: [
      { site: "Google Drive", account: `OAuth · ${company?.name ?? "Diretoria"}`, ok: true },
      { site: "WhatsApp", account: "não conectado", ok: false },
    ],
    policies: ["Sites permitidos: definidos pela empresa", "Nunca digitar códigos 2FA ou senhas", "Compras e pagamentos: sempre pedir aprovação"],
    resources: { cpu: 7, memory: "0,8 / 4 GB", memoryPct: 20, tokens: `R$ ${(bot.budget.spent / 20).toFixed(2).replace(".", ",")}`, tokensPct: 18 },
    recent: [
      { text: `Status: ${bot.activity}`, tone: bot.status === "bloqueado" ? "block" : bot.status === "esperando" ? "wait" : "ok" },
      { text: "Checou a fila de tarefas (heartbeat)", tone: "ok" },
    ],
  };
}

export const memoryFor = (bot: Bot) =>
  botMemory[bot.id] ?? `${bot.name} guarda aqui o que aprendeu sobre ${bot.role.toLowerCase()} na empresa. Nada novo nesta semana.`;

export const skillsFor = (bot: Bot) => botSkills[bot.id] ?? ["Google Drive", "Agenda"];

export function companyName(bot: Bot) {
  return companies.find((c) => c.id === bot.companyId)?.name ?? "Diretoria";
}

export function departmentName(bot: Bot) {
  const co = companies.find((c) => c.id === bot.companyId);
  return co?.departments.find((d) => d.id === bot.departmentId)?.name ?? "Diretoria";
}
