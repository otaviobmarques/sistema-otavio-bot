import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";

import type { WhatsAppStatus } from "../../shared/whatsapp.ts";
import { requiredScope, type RequestAuth } from "../request-auth.ts";
import { PASS } from "./table.ts";
import { createWhatsAppRoutes } from "./whatsapp.ts";

const OWNER: RequestAuth = { kind: "loopback", scopes: ["admin", "client"] };
const SERVICE: RequestAuth = { kind: "loopback", scopes: ["client"], trust: "service" };

function world() {
  const status: WhatsAppStatus = { state: "waiting-qr", qr: "2@secret-link-code", notify: { approvals: true, budget: true, problems: false } };
  const updates: unknown[] = [];
  const routes = createWhatsAppRoutes({
    status: () => status,
    update: (input) => { updates.push(input); return { ok: true, status }; },
    connect: () => status,
    disconnect: async () => ({ ...status, state: "off" }),
  });
  const call = async (auth: RequestAuth, method: string, path: string, body?: unknown) => {
    let code = 0, answer: unknown;
    const out = await routes({
      req: {} as never, res: {} as ServerResponse, url: new URL(`http://x${path}`), path, method, auth,
      json: ((_res: unknown, sent: number, value: unknown) => { code = sent; answer = value; }) as never, readBody: (async () => body) as never,
    });
    return { out, code, answer: answer as Record<string, unknown> };
  };
  return { call, updates };
}

describe("WhatsApp over HTTP", () => {
  it("is the owner's or an admin's alone, the QR code above all", async () => {
    for (const [method, path] of [["GET", "/api/whatsapp"], ["PUT", "/api/whatsapp/settings"], ["POST", "/api/whatsapp/connect"], ["POST", "/api/whatsapp/disconnect"]] as const) {
      expect(requiredScope(method, path), `${method} ${path}`).toBe("admin");
    }
    const { call } = world();
    expect(await call(SERVICE, "GET", "/api/whatsapp")).toMatchObject({ code: 403 });
    expect((await call(SERVICE, "GET", "/api/whatsapp")).answer.qr).toBeUndefined();
    expect(await call(OWNER, "GET", "/api/whatsapp")).toMatchObject({ code: 200, answer: { qr: "2@secret-link-code" } });
    expect((await call(OWNER, "GET", "/api/other")).out).toBe(PASS);
  });

  it("takes only a number and the three switches", async () => {
    const { call, updates } = world();
    expect((await call(OWNER, "PUT", "/api/whatsapp/settings", { ownerNumber: 5511 })).code).toBe(400);
    expect((await call(OWNER, "PUT", "/api/whatsapp/settings", { notify: { everything: true } })).code).toBe(400);
    expect((await call(OWNER, "PUT", "/api/whatsapp/settings", { ownerNumber: "+55 11 98765-4321", notify: { problems: true } })).code).toBe(200);
    expect(updates).toEqual([{ ownerNumber: "+55 11 98765-4321", notify: { problems: true } }]);
    expect((await call(OWNER, "POST", "/api/whatsapp/disconnect")).answer).toMatchObject({ state: "off" });
  });
});
