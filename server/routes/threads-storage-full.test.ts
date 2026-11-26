import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetAttachmentAccountingForTests, ATTACHMENTS_DIR } from "../attachments.ts";
import { DATA_DIR } from "../config.ts";
import type { ModelSelection } from "../contracts.ts";
import { json, readBody } from "../harness/http.ts";
import { STORAGE_FULL_CODE } from "../host/cloud-storage-quota.ts";
import type { RequestAuth } from "../request-auth.ts";
import { Store } from "../store.ts";
import { dispatchRoutes } from "./table.ts";
import { createThreadRoutes, type ThreadRouteDeps } from "./threads.ts";

const sonnet: ModelSelection = { instanceId: "claude", model: "claude-sonnet-5" };
const servers: Server[] = [];
const REFUSAL = "Seu espaço acabou: apague arquivos ou mude de plano.";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

beforeEach(() => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  __resetAttachmentAccountingForTests();
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

async function serve(full: { value: boolean }): Promise<string> {
  const deps = {
    store: new Store(() => sonnet), viewerFor: () => ({}), visibleTo: () => ({ bot: () => true, group: () => true }), workspaceAccess: () => null,
    desktopMutationToken: () => undefined, companionMutationToken: () => undefined, cliOwnerToken: () => undefined, userName: () => "Ana",
    uploads: { note: () => undefined, owns: () => true }, attachmentInUse: () => false,
    uploadRefusal: () => full.value ? REFUSAL : null,
  } as unknown as ThreadRouteDeps;
  const routes = [createThreadRoutes(deps)];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const auth = { kind: "loopback", scopes: ["admin"] } as RequestAuth;
    try {
      if (!await dispatchRoutes(routes, { req, res, url, path: url.pathname, method: req.method ?? "GET", auth, json, readBody })) json(res, 404, {});
    } catch (error) {
      json(res, (error as { status?: number }).status ?? 500, { error: String(error) });
    }
  });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("uploads on a Cloud whose space ran out", () => {
  it("refuses new pictures and files with the reason, keeps deleting, and takes them again once there is room", async () => {
    mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    const kept = "0b1c2d3e-0000-4000-8000-000000000001.pdf";
    writeFileSync(join(ATTACHMENTS_DIR, kept), "%PDF-1.4 old file");
    const full = { value: true };
    const base = await serve(full);

    const picture = await fetch(`${base}/api/attachments`, { method: "POST", headers: { "content-type": "image/png" }, body: PNG });
    expect([picture.status, await picture.json()]).toEqual([507, { error: REFUSAL, code: STORAGE_FULL_CODE }]);
    const file = await fetch(`${base}/api/files?name=nota.pdf`, { method: "POST", headers: { "content-type": "application/pdf" }, body: "%PDF-1.4 new" });
    expect([file.status, await file.json()]).toEqual([507, { error: REFUSAL, code: STORAGE_FULL_CODE }]);
    expect(readdirSync(ATTACHMENTS_DIR)).toEqual([kept]);

    // Deleting never waits on the space (reading is served elsewhere and never asks it).
    const deleted = await fetch(`${base}/api/attachments/${kept}`, { method: "DELETE" });
    expect(deleted.status).toBeLessThan(300);
    expect(existsSync(join(ATTACHMENTS_DIR, kept))).toBe(false);

    full.value = false;
    const again = await fetch(`${base}/api/files?name=nota.pdf`, { method: "POST", headers: { "content-type": "application/pdf" }, body: "%PDF-1.4 new" });
    expect(again.status).toBe(201);
  });
});
