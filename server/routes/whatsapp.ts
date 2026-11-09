import type { WhatsAppSettingsInput, WhatsAppStatus } from "../../shared/whatsapp.ts";
import { ownerOrAdmin } from "../request-auth.ts";
import { userError } from "../user-errors.ts";
import type { SettingsOutcome } from "../whatsapp/connection.ts";
import { PASS, type RouteHandler } from "./table.ts";

export const WHATSAPP_PATH = "/api/whatsapp";

export interface WhatsAppRouteDeps {
  status(): WhatsAppStatus;
  update(input: WhatsAppSettingsInput): SettingsOutcome;
  connect(): WhatsAppStatus;
  disconnect(): Promise<WhatsAppStatus>;
}

function settingsInput(body: unknown): WhatsAppSettingsInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { ownerNumber, notify } = body as Record<string, unknown>;
  const input: WhatsAppSettingsInput = {};
  if (ownerNumber !== undefined) {
    if (typeof ownerNumber !== "string" || ownerNumber.length > 40) return null;
    input.ownerNumber = ownerNumber;
  }
  if (notify !== undefined) {
    if (!notify || typeof notify !== "object" || Array.isArray(notify)) return null;
    const picked: NonNullable<WhatsAppSettingsInput["notify"]> = {};
    for (const [key, value] of Object.entries(notify)) {
      if ((key !== "approvals" && key !== "budget" && key !== "problems") || typeof value !== "boolean") return null;
      picked[key] = value;
    }
    input.notify = picked;
  }
  return input;
}

/** GET /api/whatsapp: the link's status, with the QR code while one waits to be scanned. PUT /api/whatsapp/settings: the
 * owner's number and which news goes there. POST /api/whatsapp/connect and /api/whatsapp/disconnect. Security
 * invariant: only the owner or an admin reads or changes any of it, the QR code above all, since scanning it links a
 * device; the session's own keys never leave the server. */
export function createWhatsAppRoutes(deps: WhatsAppRouteDeps): RouteHandler {
  return async ({ req, res, path, method, auth, json, readBody }) => {
    if (path !== WHATSAPP_PATH && !path.startsWith(`${WHATSAPP_PATH}/`)) return PASS;
    if (!ownerOrAdmin(auth)) return json(res, 403, userError("serverError.whatsapp.ownerOnly"));
    if (path === WHATSAPP_PATH) {
      if (method !== "GET") return json(res, 405, { error: "method not allowed" });
      return json(res, 200, deps.status());
    }
    if (path === `${WHATSAPP_PATH}/settings`) {
      if (method !== "PUT") return json(res, 405, { error: "method not allowed" });
      let body: unknown;
      try {
        body = await readBody(req);
      } catch {
        body = undefined;
      }
      const input = settingsInput(body);
      if (!input) return json(res, 400, userError("serverError.whatsapp.invalidNumber"));
      const outcome = deps.update(input);
      return outcome.ok ? json(res, 200, outcome.status) : json(res, 400, userError(outcome.code));
    }
    if (method !== "POST") return json(res, 405, { error: "method not allowed" });
    if (path === `${WHATSAPP_PATH}/connect`) return json(res, 200, deps.connect());
    if (path === `${WHATSAPP_PATH}/disconnect`) return json(res, 200, await deps.disconnect());
    return json(res, 404, { error: "not found" });
  };
}
