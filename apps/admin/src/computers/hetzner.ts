// Hetzner Cloud API (https://api.hetzner.cloud/v1, bearer token of a project: Console → Security → API tokens). Billed by
// the hour with a monthly cap, so a server costs nothing once deleted, and deleting it erases its disk. The first-boot
// script goes in as cloud-init user data (a shell script is valid user data). No SSH key is passed by the API: Hetzner
// takes names of keys stored in the project, and the script installs the operator's keys itself.
import { jsonCall, type MachineRef, type OrderRequest, type OrderResult, type VirtualMachine, type VpsProvider } from "./provider.ts";

export const HETZNER_API = "https://api.hetzner.cloud/v1";
export const HETZNER_IMAGE = "ubuntu-24.04";

interface HetznerServer {
  id: number;
  name?: string;
  status?: string;
  public_net?: { ipv4?: { ip?: string } | null } | null;
}

const PHASE: Record<string, VirtualMachine["phase"]> = {
  running: "running", off: "stopped", stopping: "stopped", deleting: "gone", unknown: "error",
};

export function hetznerMachine(server: HetznerServer): VirtualMachine {
  const state = server.status ?? "unknown";
  return {
    id: String(server.id), subscriptionRef: null, phase: PHASE[state] ?? "installing", state, hostname: server.name ?? null,
    ipv4: server.public_net?.ipv4?.ip ?? null,
  };
}

/** A server name Hetzner accepts (a hostname label), unique per project. */
export function hetznerName(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63) || "arkobot";
}

export class HetznerProvider implements VpsProvider {
  readonly kind = "hetzner" as const;
  readonly deletesOnCancel = true;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(token: string, fetcher: typeof fetch, base = HETZNER_API) {
    this.#token = token;
    this.#fetch = fetcher;
    this.#base = base.replace(/\/+$/, "");
  }

  #call<T>(method: string, path: string, body?: unknown) {
    return jsonCall<T>(this.#fetch, "Hetzner", `${this.#base}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.#token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async order(request: OrderRequest): Promise<OrderResult> {
    const image = request.imageRef ?? HETZNER_IMAGE;
    const { data } = await this.#call<{ server: HetznerServer }>("POST", "/servers", {
      name: hetznerName(request.label), server_type: request.planRef, image, ...(request.regionRef ? { location: request.regionRef } : {}),
      user_data: request.script, start_after_create: true, public_net: { enable_ipv4: true, enable_ipv6: true },
      labels: { "arkobot-managed": "true" },
    });
    return { orderRef: String(data.server.id), subscriptionRef: null, machine: hetznerMachine(data.server), regionRef: request.regionRef, imageRef: image, scriptRef: null };
  }

  async status(ref: MachineRef): Promise<VirtualMachine | null> {
    if (!ref.vmId) return null;
    try {
      return hetznerMachine((await this.#call<{ server: HetznerServer }>("GET", `/servers/${encodeURIComponent(ref.vmId)}`)).data.server);
    } catch (error) {
      if ((error as { status?: number }).status === 404) return { id: ref.vmId, subscriptionRef: null, phase: "gone", state: "deleted", hostname: null, ipv4: null };
      throw error;
    }
  }

  async setup() {
    // A Hetzner server is installed by its create call.
  }

  async cleanup() {
    // Nothing is stored at Hetzner besides the server.
  }

  async cancel(ref: MachineRef) {
    if (ref.vmId) {
      try {
        await this.#call("DELETE", `/servers/${encodeURIComponent(ref.vmId)}`);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
    }
    return { autoRenew: false, expiresAt: null };
  }
}
