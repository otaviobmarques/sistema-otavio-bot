import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { createCloudHealth } from "../cloud-health.ts";
import { cloudRequestSignature } from "../cloud-home.ts";
import { DATA_DIR } from "../config.ts";
import { cloudStorageSchema } from "../host/cloud-storage-quota.ts";
import { SessionRegistry } from "../sessions.ts";
import { CLOUD_STORAGE_PATH, createCloudSignedRoutes } from "./cloud-signed.ts";

const secret = "S".repeat(43);

function routes(withStorage = true) {
  let counter = 0;
  const now = () => 1_800_000_000_000;
  const told: unknown[] = [];
  const sessions = new SessionRegistry({ file: join(DATA_DIR, "sessions.json"), now });
  const health = createCloudHealth({
    store: { onChange: () => () => {}, botByThread: () => null, bots: [] }, bus: { subscribe: () => () => {} },
    engines: () => [], dataDir: DATA_DIR, eventsDir: DATA_DIR, version: "0.1.0", image: undefined, connectors: () => null,
    browser: () => ({ available: true, installing: false, interrupted: 0 }), now,
  });
  const storage = (status: unknown) => { if (!cloudStorageSchema.safeParse(status).success) return false; told.push(status); return true; };
  const handle = createCloudSignedRoutes({ secret, sessions, health, now, ...(withStorage ? { storage } : {}) });
  const sign = (body: string, key = secret, method = "POST") => {
    const timestamp = String(Math.floor(now() / 1000)), nonce = `nonce-${String(++counter).padStart(12, "0")}`;
    return { "content-type": "application/json", "x-omb-cloud-timestamp": timestamp, "x-omb-cloud-nonce": nonce,
      "x-omb-cloud-signature": `v1=${cloudRequestSignature(key, timestamp, nonce, method, CLOUD_STORAGE_PATH, body)}` };
  };
  const send = async (method: string, headers: Record<string, string>, body: string) => {
    const req = Object.assign(new PassThrough(), { method, url: CLOUD_STORAGE_PATH, headers, socket: { remoteAddress: "127.0.0.1" } }) as unknown as IncomingMessage;
    let status = 0, text = "";
    const res = { setHeader() {}, writeHead(code: number) { status = code; }, end(data: string) { text = data; } } as unknown as ServerResponse;
    const url = new URL(CLOUD_STORAGE_PATH, "http://localhost");
    const answered = handle({ req, res, url, path: url.pathname, method });
    (req as unknown as PassThrough).end(body);
    return { answered: await answered, status, body: text ? JSON.parse(text) : null };
  };
  return { sign, send, told };
}

describe("POST /api/cloud/storage", () => {
  it("takes the Admin's signed word on how full the disk is", async () => {
    const { sign, send, told } = routes();
    const body = JSON.stringify({ v: 1, state: "over", usedBytes: 6_000_000_000, quotaBytes: 5_368_709_120 });
    expect(await send("POST", sign(body), body)).toEqual({ answered: true, status: 200, body: { ok: true } });
    expect(told).toEqual([{ state: "over", usedBytes: 6_000_000_000, quotaBytes: 5_368_709_120 }]);
  });

  it("refuses a wrong key, a replay, a bad body and anything but POST; changes nothing", async () => {
    const { sign, send, told } = routes();
    const body = JSON.stringify({ v: 1, state: "over", usedBytes: 9, quotaBytes: 1 });
    expect((await send("POST", sign(body, "W".repeat(43)), body)).status).toBe(401);
    expect(told).toEqual([]);
    const once = sign(body);
    expect((await send("POST", once, body)).status).toBe(200);
    expect((await send("POST", once, body)).body).toEqual({ error: "replayed_request" });
    for (const bad of [{ state: "over", usedBytes: 9, quotaBytes: 1 }, { v: 2, state: "over", usedBytes: 9, quotaBytes: 1 }, { v: 1, state: "lotado", usedBytes: 9, quotaBytes: 1 }]) {
      const text = JSON.stringify(bad);
      expect(await send("POST", sign(text), text)).toMatchObject({ status: 400, body: { error: "invalid_storage" } });
    }
    expect((await send("GET", sign("", secret, "GET"), "")).status).toBe(405);
    expect(told).toHaveLength(1);
  });

  it("is not a route on a server that does not keep a storage state", async () => {
    const { sign, send } = routes(false);
    const body = JSON.stringify({ v: 1, state: "over", usedBytes: 9, quotaBytes: 1 });
    expect((await send("POST", sign(body), body)).answered).toBe(false);
  });
});
