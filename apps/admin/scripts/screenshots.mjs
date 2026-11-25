// Screenshots (1440×900) of every panel screen into apps/admin/screenshots/.
// Needs the panel running (pnpm start after pnpm build, or pnpm dev) with demo data (pnpm seed:demo),
// and Playwright with Chromium. Signs in by writing a session row straight to the database,
// so it only works where DATABASE_URL is a development database.
//   ADMIN_URL=http://localhost:8790 ADMIN_EMAIL=otavio@domma.com.br node scripts/screenshots.mjs
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("..", import.meta.url));
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return createRequire(join(globalRoot, "noop.js"))("playwright");
  }
}

const base = (process.env.ADMIN_URL ?? "http://localhost:8790").replace(/\/$/, "");
const email = process.env.ADMIN_EMAIL ?? "otavio@domma.com.br";
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const admin = (await db.query("SELECT id FROM admins WHERE email = $1", [email])).rows[0];
if (!admin) throw new Error(`Crie o admin ${email} antes (pnpm create-admin ${email})`);
const token = randomBytes(32).toString("base64url");
await db.query("INSERT INTO admin_sessions (admin_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, now() + interval '1 hour', '127.0.0.1', 'screenshots')",
  [admin.id, createHash("sha256").update(token).digest("hex")]);
const client = (await db.query("SELECT id FROM organizations WHERE name LIKE 'Clínica%' LIMIT 1")).rows[0]
  ?? (await db.query("SELECT id FROM organizations ORDER BY created_at LIMIT 1")).rows[0];
const overdue = (await db.query("SELECT organization_id AS id FROM subscriptions WHERE status = 'past_due' LIMIT 1")).rows[0];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
const page = await context.newPage();
const shot = async (name, path, prepare) => {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  if (prepare) {
    await prepare();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`screenshots/${name}.png`);
};

await shot("01-login", "/login");
await shot("02-login-codigo", "/login", async () => {
  await page.fill("input[type=email]", "voce@domma.com.br");
  await page.click("button[type=submit]");
  await page.waitForSelector("input[autocomplete=one-time-code]");
});

await context.addCookies([{ name: "arko_admin_session", value: token, url: base, httpOnly: true, sameSite: "Strict" }]);
await shot("03-visao-geral", "/");
await shot("04-clientes", "/clientes");
await shot("05-novo-cliente", "/clientes", () => page.getByRole("button", { name: "Novo cliente" }).click());
if (client) await shot("06-cliente-detalhe", `/clientes/${client.id}`);
if (client) await shot("07-ajustar-creditos", `/clientes/${client.id}`, () => page.getByRole("button", { name: "Ajustar créditos" }).click());
if (overdue) await shot("08-cliente-em-atraso", `/clientes/${overdue.id}`);
await shot("09-planos", "/planos");
await shot("10-editar-plano", "/planos", () => page.getByRole("button", { name: "Editar" }).first().click());
await shot("11-cobranca-contas", "/cobranca?aba=contas");
await shot("12-cobranca-assinaturas", "/cobranca?aba=assinaturas");
await shot("13-cobranca-pagamentos", "/cobranca?aba=pagamentos");
await shot("14-cobranca-inadimplentes", "/cobranca?aba=inadimplentes");
await shot("15-cobranca-webhooks", "/cobranca?aba=eventos");
await shot("16-integracoes", "/integracoes");
await shot("17-auditoria", "/auditoria");
await shot("18-instancias", "/instancias");
await shot("19-computadores", "/computadores");
await shot("20-consumo", "/consumo");
await shot("23-consumo-por-bot", "/consumo", () => page.getByRole("button", { name: /^Por bot/ }).click());
await shot("24-tabela-de-precos", "/precos");
await shot("25-editar-preco", "/precos", () => page.getByRole("button", { name: "Editar" }).first().click());
if (client) {
  await shot("26-cliente-gateway", `/clientes/${client.id}`, () => page.getByText("Gateway de IA").scrollIntoViewIfNeeded());
  await shot("27-emitir-token", `/clientes/${client.id}`, async () => {
    await page.getByRole("button", { name: "Emitir token" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Emitir" }).click();
    await page.waitForSelector("textarea[readonly]");
    // The token is a development one, but a screenshot never shows a whole token.
    await page.$eval("textarea[readonly]", (node) => { node.value = `${node.value.slice(0, 14)}${"•".repeat(37)}`; });
  });
}
await shot("21-minha-conta", "/conta");
await shot("22-segundo-fator", "/conta", () => page.getByRole("button", { name: "Configurar" }).click());

await browser.close();
await db.query("DELETE FROM admin_sessions WHERE token_hash = $1", [createHash("sha256").update(token).digest("hex")]);
await db.end();
