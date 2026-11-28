// The backup and restore helper (bundled as task-helper.mjs in the agent's image; started by tasks.ts, one container per
// step). `upload`: sends /stage/<task>.tgz to the backup store in parts whose URLs the Admin signs, then tells the Admin
// the parts and the archive's hash. `restore`: downloads a signed URL and unpacks it into /v. Never logs a URL or token.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { AGENT_API, BACKUP_PART_BYTES } from "../provisioning/protocol.ts";

const env = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`falta ${name}`);
  return value;
};

async function admin(path: string, body: unknown, fetcher: typeof fetch = fetch): Promise<any> {
  const response = await fetcher(`${env("ARKO_ADMIN_URL")}${AGENT_API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env("ARKO_NODE_TOKEN")}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Admin respondeu ${response.status} em ${path.replace(/[0-9a-f-]{36}/, "…")}`);
  return response.json();
}

async function withRetries<T>(what: string, attempt: () => Promise<T>, tries = 4, delayMs = 2_000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
      if (i < tries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** i));
    }
  }
  throw new Error(`${what}: ${(last as Error)?.message ?? last}`);
}

export async function upload(fetcher: typeof fetch = fetch, partBytes = BACKUP_PART_BYTES, retryDelayMs = 2_000): Promise<void> {
  const task = env("ARKO_TASK_ID");
  const file = env("ARKO_FILE");
  try {
    const { size } = await stat(file);
    const handle = await open(file, "r");
    const hash = createHash("sha256");
    const parts: { partNumber: number; etag: string }[] = [];
    try {
      const count = Math.max(1, Math.ceil(size / partBytes));
      for (let partNumber = 1; partNumber <= count; partNumber++) {
        const length = Math.min(partBytes, size - (partNumber - 1) * partBytes);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, (partNumber - 1) * partBytes);
        hash.update(buffer);
        const etag = await withRetries(`parte ${partNumber}`, async () => {
          const { url } = await admin(`/tasks/${task}/part`, { partNumber }, fetcher);
          const response = await fetcher(url, { method: "PUT", body: buffer, headers: { "content-length": String(length) }, signal: AbortSignal.timeout(15 * 60_000) });
          if (!response.ok) throw new Error(`armazenamento respondeu ${response.status}`);
          await response.body?.cancel().catch(() => undefined);
          const tag = response.headers.get("etag");
          if (!tag) throw new Error("armazenamento não devolveu o ETag");
          return tag;
        }, 4, retryDelayMs);
        parts.push({ partNumber, etag });
      }
    } finally {
      await handle.close();
    }
    await withRetries("concluir", () => admin(`/tasks/${task}/complete`, { parts, bytes: size, sha256: hash.digest("hex") }, fetcher), 4, retryDelayMs);
    console.log(`backup enviado: ${parts.length} parte(s), ${size} bytes`);
  } catch (error) {
    await admin(`/tasks/${task}/fail`, { error: (error as Error).message.slice(0, 900) }, fetcher).catch(() => undefined);
    throw error;
  } finally {
    await rm(file, { force: true });
  }
}

/** Empties /v (a retry may find half an archive) and unpacks the download into it. */
export async function restore(fetcher: typeof fetch = fetch, target = "/v"): Promise<void> {
  for (const entry of await readdir(target)) await rm(join(target, entry), { recursive: true, force: true });
  const response = await fetcher(env("ARKO_RESTORE_URL"), { redirect: "follow", signal: AbortSignal.timeout(6 * 3600_000) });
  if (!response.ok || !response.body) throw new Error(`armazenamento respondeu ${response.status}`);
  const tar = spawn("tar", ["-C", target, "--numeric-owner", "-xzf", "-"], { stdio: ["pipe", "inherit", "inherit"] });
  const exited = new Promise<number>((resolve) => tar.on("close", (code) => resolve(code ?? 1)));
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), tar.stdin);
  const code = await exited;
  if (code !== 0) throw new Error(`tar terminou com código ${code}`);
  console.log("dados restaurados");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const step = process.argv[2];
  (step === "upload" ? upload() : step === "restore" ? restore() : Promise.reject(new Error("use upload ou restore"))).catch((error) => {
    console.error(`[arkobot-task] ${(error as Error).message}`);
    process.exit(1);
  });
}
