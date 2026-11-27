// Hostinger's public API (https://developers.hostinger.com, bearer token from hPanel → API). Shapes from its OpenAPI
// document (developers.hostinger.com/openapi/openapi.json). A purchase that answers 202 is still taking payment: the
// machine is found later by its subscription id.
import { jsonCall, VpsProviderError, type MachineRef, type OrderRequest, type OrderResult, type VirtualMachine, type VpsProvider } from "./provider.ts";

export const HOSTINGER_API = "https://developers.hostinger.com";
export const HOSTINGER_TEMPLATE = /ubuntu 24\.04.*docker/i;

interface HostingerVm {
  id: number;
  subscription_id?: string | null;
  state?: string;
  hostname?: string | null;
  ipv4?: { address?: string }[] | null;
}

const PHASE: Record<string, VirtualMachine["phase"]> = {
  running: "running", stopped: "stopped", stopping: "stopped", suspended: "stopped", suspending: "stopped",
  error: "error", destroyed: "gone", destroying: "gone", initial: "needs_setup",
};

export function hostingerMachine(vm: HostingerVm): VirtualMachine {
  const state = vm.state ?? "unknown";
  return {
    id: String(vm.id), subscriptionRef: vm.subscription_id ?? null, phase: PHASE[state] ?? "installing", state, hostname: vm.hostname ?? null,
    ipv4: vm.ipv4?.find((ip) => typeof ip.address === "string")?.address ?? null,
  };
}

export class HostingerProvider implements VpsProvider {
  readonly kind = "hostinger" as const;
  readonly deletesOnCancel = false;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(token: string, fetcher: typeof fetch, base = HOSTINGER_API) {
    this.#token = token;
    this.#fetch = fetcher;
    this.#base = base.replace(/\/+$/, "");
  }

  #call<T>(method: string, path: string, body?: unknown) {
    return jsonCall<T>(this.#fetch, "Hostinger", `${this.#base}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.#token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async #template(imageRef: string | null): Promise<number> {
    if (imageRef) return Number(imageRef);
    const { data } = await this.#call<{ id: number; name: string }[]>("GET", "/api/vps/v1/templates");
    const found = data.find((t) => HOSTINGER_TEMPLATE.test(t.name));
    if (!found) throw new VpsProviderError("Hostinger: modelo \"Ubuntu 24.04 with Docker\" não encontrado; defina o modelo nas configurações", null, false);
    return found.id;
  }

  async #dataCenter(regionRef: string | null): Promise<number> {
    if (regionRef) return Number(regionRef);
    const { data } = await this.#call<{ id: number; location: string | null }[]>("GET", "/api/vps/v1/data-centers");
    const chosen = data.find((dc) => dc.location?.toLowerCase() === "br") ?? data[0];
    if (!chosen) throw new VpsProviderError("Hostinger: nenhum data center disponível", null, false);
    return chosen.id;
  }

  #setupBody(templateId: number, dataCenterId: number, scriptRef: string | null) {
    return {
      template_id: templateId, data_center_id: dataCenterId,
      ...(scriptRef ? { post_install_script_id: Number(scriptRef) } : {}),
      install_monarx: false, enable_backups: false,
    };
  }

  async order(request: OrderRequest): Promise<OrderResult> {
    const templateId = await this.#template(request.imageRef);
    const dataCenterId = await this.#dataCenter(request.regionRef);
    const script = await this.#call<{ id: number }>("POST", "/api/vps/v1/post-install-scripts", { name: request.label.slice(0, 60), content: request.script });
    const scriptRef = String(script.data.id);
    let purchase;
    try {
      purchase = await this.#call<{
        order?: { id?: number; subscription_id?: string }; virtual_machine?: HostingerVm; id?: number; subscription_id?: string | null;
      }>("POST", "/api/vps/v1/virtual-machines", { item_id: request.planRef, setup: this.#setupBody(templateId, dataCenterId, scriptRef) });
    } catch (error) {
      if (error instanceof VpsProviderError && !error.ambiguous) await this.cleanup(scriptRef).catch(() => undefined);
      throw error;
    }
    const { status, data } = purchase;
    const base = { regionRef: String(dataCenterId), imageRef: String(templateId), scriptRef };
    if (status === 202) return { ...base, orderRef: data.id ? String(data.id) : null, subscriptionRef: data.subscription_id ?? null, machine: null };
    return {
      ...base,
      orderRef: data.order?.id ? String(data.order.id) : null,
      subscriptionRef: data.order?.subscription_id ?? data.virtual_machine?.subscription_id ?? null,
      machine: data.virtual_machine ? hostingerMachine(data.virtual_machine) : null,
    };
  }

  async status(ref: MachineRef): Promise<VirtualMachine | null> {
    if (ref.vmId) return hostingerMachine((await this.#call<HostingerVm>("GET", `/api/vps/v1/virtual-machines/${encodeURIComponent(ref.vmId)}`)).data);
    if (!ref.subscriptionRef) return null;
    const { data } = await this.#call<HostingerVm[]>("GET", "/api/vps/v1/virtual-machines");
    const vm = data.find((item) => item.subscription_id === ref.subscriptionRef);
    return vm ? hostingerMachine(vm) : null;
  }

  async setup(vmId: string, request: OrderRequest & { scriptRef: string | null }) {
    const body = this.#setupBody(await this.#template(request.imageRef), await this.#dataCenter(request.regionRef), request.scriptRef);
    await this.#call("POST", `/api/vps/v1/virtual-machines/${encodeURIComponent(vmId)}/setup`, body);
  }

  async cleanup(scriptRef: string) {
    await this.#call("DELETE", `/api/vps/v1/post-install-scripts/${encodeURIComponent(scriptRef)}`);
  }

  async cancel(ref: MachineRef) {
    if (!ref.subscriptionRef) throw new VpsProviderError("Hostinger: máquina sem assinatura conhecida; desligue a renovação no hPanel", null, false);
    const { data } = await this.#call<{ is_auto_renewed: boolean; expires_at: string | null }>(
      "DELETE", `/api/billing/v1/subscriptions/${encodeURIComponent(ref.subscriptionRef)}/auto-renewal/disable`);
    return { autoRenew: data.is_auto_renewed, expiresAt: data.expires_at ?? null };
  }
}
