import { userInfo } from "node:os";
import { createNode, rotateNodeToken } from "../provisioning/nodes.ts";
import { cliDb } from "./env.ts";

// Cadastra um servidor (nó) que roda instâncias de clientes e mostra o token do agente UMA vez.
//   pnpm --filter admin create-node vps-hostinger-1 --capacity=20 --ip=200.141.20.53
//   pnpm --filter admin create-node vps-hostinger-1 --rotate        (novo token; o antigo para na hora)
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const name = args.find((arg) => !arg.startsWith("--"));
const option = (key: string) => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const capacity = option("capacity") ? Number(option("capacity")) : null;
const ramMb = option("ram-mb") ? Number(option("ram-mb")) : null;
if (!name || (capacity !== null && !(Number.isInteger(capacity) && capacity > 0)) || (ramMb !== null && !(Number.isInteger(ramMb) && ramMb > 0))) {
  console.error("Uso: pnpm --filter admin create-node <nome> [--capacity=20] [--ram-mb=16384] [--ip=1.2.3.4] [--kind=shared_free|dedicated] [--rotate]");
  process.exit(1);
}

const db = cliDb();
const actor = { type: "cli" as const, label: `cli:${userInfo().username}` };
try {
  let token: string;
  if (args.includes("--rotate")) {
    const { rows } = await db.query<{ id: string }>("SELECT id FROM nodes WHERE name = $1", [name.toLowerCase()]);
    if (!rows[0]) throw new Error(`Servidor ${name} não encontrado`);
    token = await rotateNodeToken(db, actor, rows[0].id);
    console.log(`Novo token do servidor ${name} (o anterior já não vale):`);
  } else {
    const kind = option("kind") === "dedicated" ? "dedicated" : "shared_free";
    const created = await createNode(db, actor, { name, kind, publicIp: option("ip") ?? null, capacityInstances: capacity, capacityRamMb: ramMb });
    token = created.token;
    console.log(`Servidor ${created.node.name} cadastrado (${created.node.id}). Token do agente — guarde agora, ele não aparece de novo:`);
  }
  console.log(`\n  ARKO_NODE_TOKEN=${token}\n`);
  console.log("Ponha essa linha no .env do agente na VPS (apps/admin/deploy/node-agent.vps.compose.yml).");
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
