import { migrate } from "../db/migrate.ts";
import { cliDb } from "./env.ts";

const db = cliDb();
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(", ")}` : "O banco já está atualizado.");
} finally {
  await db.close();
}
