// The Admin's signed requests to a customer's instance (docs/cloud-pro.md, "Pairing: the Admin's signed request"):
// HMAC-SHA256 with the instance's bootstrap secret over method, path and query, timestamp, nonce and the body's hash.
// Must match cloudRequestSignature in server/cloud-home.ts. Nothing here logs a secret, a body or a credential.
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { AppContext } from "../context.ts";

export function cloudRequestSignature(secret: string, timestamp: string, nonce: string, method: string, target: string, body: string): string {
  const bodyHash = createHash("sha256").update(body).digest("base64url");
  return createHmac("sha256", secret).update(`v1\n${timestamp}\n${nonce}\n${method}\n${target}\n${bodyHash}`).digest("base64url");
}

export class InstanceUnreachable extends Error {}

export interface CloudAnswer {
  status: number;
  data: Record<string, unknown> | null;
}

/** One signed request to `publicUrl` + `target`. Throws InstanceUnreachable when the instance cannot be reached. */
export async function signedCloudRequest(
  ctx: Pick<AppContext, "fetch" | "now">, instance: { publicUrl: string; secret: string }, method: "GET" | "POST", target: string, payload?: unknown,
): Promise<CloudAnswer> {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = String(Math.floor(ctx.now().getTime() / 1000));
  const nonce = randomBytes(24).toString("base64url");
  const signature = cloudRequestSignature(instance.secret, timestamp, nonce, method, target, body);
  let response: Response;
  try {
    response = await ctx.fetch(`${instance.publicUrl}${target}`, {
      method,
      headers: {
        "x-omb-cloud-timestamp": timestamp, "x-omb-cloud-nonce": nonce, "x-omb-cloud-signature": `v1=${signature}`,
        accept: "application/json", ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body || undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new InstanceUnreachable(`instância fora do ar (${error instanceof Error ? error.name : "erro"})`);
  }
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

/** The instance's Admin-signed plan word (POST /api/cloud/plan): its plan code, which sets its bot limit. */
export const CLOUD_TIER = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * A one-time browser sign-in for the instance's owner (purpose "browser"): the credential works once, for at most two
 * minutes, and only from the URL fragment of /pair, which never reaches a server or a log.
 */
export async function browserSignInUrl(
  ctx: Pick<AppContext, "fetch" | "now">, instance: { publicUrl: string; secret: string }, owner: string,
): Promise<string> {
  const answer = await signedCloudRequest(ctx, instance, "POST", "/api/cloud/pairing", {
    label: "Área do cliente ArkoBot", purpose: "browser", owner, ttlSeconds: 120,
  });
  const credential = answer.data?.credential;
  if (answer.status !== 200 || answer.data?.purpose !== "browser" || typeof credential !== "string" || !/^omb_pair_[A-Za-z0-9_-]{20,200}$/.test(credential)) {
    throw new InstanceUnreachable(`a instância não abriu o acesso (HTTP ${answer.status}${typeof answer.data?.error === "string" ? `: ${answer.data.error}` : ""})`);
  }
  return `${instance.publicUrl}/pair#signin=${credential}`;
}
