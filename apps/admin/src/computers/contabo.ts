// Contabo API (https://api.contabo.com/v1, token from https://auth.contabo.com with the API client and the API user of
// Customer Control Panel → API). Every call carries a fresh x-request-id. A new instance can stay "provisioning" for hours,
// and some products charge a setup fee; neither the fee nor the price comes back from the API, so they are recorded from
// the settings. Their cheapest prices assume a long term (12 or 24 months), which does not fit a monthly resale.
import { randomUUID } from "node:crypto";
import { jsonCall, VpsProviderError, type MachineRef, type OrderRequest, type OrderResult, type VirtualMachine, type VpsProvider } from "./provider.ts";

export const CONTABO_API = "https://api.contabo.com/v1";
export const CONTABO_AUTH = "https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token";

export interface ContaboCredentials {
  clientId: string;
  clientSecret: string;
  apiUser: string;
  apiPassword: string;
}

interface ContaboInstance {
  instanceId: number;
  name?: string;
  displayName?: string;
  status?: string;
  ipConfig?: { v4?: { ip?: string } | null } | null;
  cancelDate?: string | null;
}

const PHASE: Record<string, VirtualMachine["phase"]> = {
  running: "running", stopped: "stopped", error: "error", uninstalled: "gone", product_not_available: "error",
};

export function contaboMachine(instance: ContaboInstance): VirtualMachine {
  const state = (instance.status ?? "unknown").toLowerCase();
  return {
    id: String(instance.instanceId), subscriptionRef: String(instance.instanceId), phase: PHASE[state] ?? "installing", state,
    hostname: instance.name ?? null, ipv4: instance.ipConfig?.v4?.ip ?? null,
  };
}

export class ContaboProvider implements VpsProvider {
  readonly kind = "contabo" as const;
  readonly deletesOnCancel = false;
  readonly #credentials: ContaboCredentials;
  readonly #fetch: typeof fetch;
  readonly #base: string;
  readonly #authUrl: string;
  #token: { value: string; until: number } | null = null;

  constructor(credentials: ContaboCredentials, fetcher: typeof fetch, base = CONTABO_API, authUrl = CONTABO_AUTH) {
    this.#credentials = credentials;
    this.#fetch = fetcher;
    this.#base = base.replace(/\/+$/, "");
    this.#authUrl = authUrl;
  }

  async #accessToken(): Promise<string> {
    if (this.#token && this.#token.until > Date.now()) return this.#token.value;
    const form = new URLSearchParams({
      client_id: this.#credentials.clientId, client_secret: this.#credentials.clientSecret,
      username: this.#credentials.apiUser, password: this.#credentials.apiPassword, grant_type: "password",
    });
    const { data } = await jsonCall<{ access_token: string; expires_in?: number }>(this.#fetch, "Contabo (login)", this.#authUrl, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString(),
    });
    this.#token = { value: data.access_token, until: Date.now() + Math.max(30, (data.expires_in ?? 300) - 30) * 1000 };
    return data.access_token;
  }

  async #call<T>(method: string, path: string, body?: unknown) {
    const token = await this.#accessToken();
    return jsonCall<T>(this.#fetch, "Contabo", `${this.#base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`, "x-request-id": randomUUID(), accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async #image(imageRef: string | null): Promise<string> {
    if (imageRef) return imageRef;
    const { data } = await this.#call<{ data: { imageId: string; name: string }[] }>("GET", "/compute/images?standardImage=true&name=ubuntu-24.04&size=50");
    const found = data.data.find((image) => /ubuntu-24\.04/i.test(image.name));
    if (!found) throw new VpsProviderError("Contabo: imagem Ubuntu 24.04 não encontrada; defina a imagem nas configurações", null, false);
    return found.imageId;
  }

  async order(request: OrderRequest): Promise<OrderResult> {
    const imageId = await this.#image(request.imageRef);
    const { data } = await this.#call<{ data: ContaboInstance[] }>("POST", "/compute/instances", {
      imageId, productId: request.planRef, ...(request.regionRef ? { region: request.regionRef } : {}),
      userData: request.script, period: 1, displayName: request.label.slice(0, 255), defaultUser: "root",
    });
    const created = data.data[0];
    if (!created) throw new VpsProviderError("Contabo: pedido aceito sem instância na resposta; confira no painel da Contabo", 201, true);
    return {
      orderRef: String(created.instanceId), subscriptionRef: String(created.instanceId), machine: contaboMachine(created),
      regionRef: request.regionRef, imageRef: imageId, scriptRef: null,
    };
  }

  async status(ref: MachineRef): Promise<VirtualMachine | null> {
    const id = ref.vmId ?? ref.subscriptionRef;
    if (!id) return null;
    const { data } = await this.#call<{ data: ContaboInstance[] }>("GET", `/compute/instances/${encodeURIComponent(id)}`);
    return data.data[0] ? contaboMachine(data.data[0]) : null;
  }

  async setup() {
    // A Contabo instance is installed by its create call.
  }

  async cleanup() {
    // Nothing is stored at Contabo besides the instance.
  }

  async cancel(ref: MachineRef) {
    const id = ref.vmId ?? ref.subscriptionRef;
    if (!id) throw new VpsProviderError("Contabo: instância desconhecida; cancele no painel da Contabo", null, false);
    const { data } = await this.#call<{ data: { cancelDate?: string | null }[] }>("POST", `/compute/instances/${encodeURIComponent(id)}/cancel`, {});
    return { autoRenew: false, expiresAt: data.data[0]?.cancelDate ?? null };
  }
}
