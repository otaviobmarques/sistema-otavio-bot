import { userInfo } from "node:os";
import { createAdmin, type AdminRole } from "../auth/auth.ts";
import { cliDb } from "./env.ts";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const email = args.find((arg) => !arg.startsWith("--"));
const role = (args.find((arg) => arg.startsWith("--role="))?.slice(7) ?? "owner") as AdminRole;
const name = args.find((arg) => arg.startsWith("--name="))?.slice(7) ?? "";
if (!email || !["owner", "operator", "viewer"].includes(role)) {
  console.error("Uso: pnpm --filter admin create-admin email@dominio.com [--name=Nome] [--role=owner|operator|viewer]");
  process.exit(1);
}

const db = cliDb();
try {
  const result = await db.tx((q) => createAdmin(q, email, name, role, `cli:${userInfo().username}`));
  console.log(result.created
    ? `Administrador ${email} criado (${role}). Entre no painel com este e-mail; o código chega pelo Mailer configurado.`
    : `O administrador ${email} já existia e está ativo.`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
