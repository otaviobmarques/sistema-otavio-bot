import { tick } from "../jobs/handlers.ts";
import { createRuntime } from "../runtime.ts";
import { loadDotEnv } from "./env.ts";

loadDotEnv();
const ctx = createRuntime();
const loop = process.argv.includes("--loop");
try {
  do {
    console.log(new Date().toISOString(), JSON.stringify(await tick(ctx)));
    if (loop) await new Promise((resolve) => setTimeout(resolve, 30_000));
  } while (loop);
} finally {
  await ctx.db.close();
}
