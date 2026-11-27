// The VPS providers behind the "Computador próprio" add-on. Everything that can spend money or touch a server goes through
// this interface, so tests run on a fake and never reach a provider. Credentials come from the environment and are only
// ever sent as request headers or form fields to the provider itself.

export const VPS_PROVIDERS = ["hetzner", "hostinger", "contabo"] as const;
export type VpsProviderKind = (typeof VPS_PROVIDERS)[number];

/** A machine as the provider reports it. `phase` is ours; `state` is the provider's own word, for the panel. */
export interface VirtualMachine {
  id: string;
  subscriptionRef: string | null;
  phase: "installing" | "running" | "stopped" | "error" | "gone" | "needs_setup";
  state: string;
  hostname: string | null;
  ipv4: string | null;
}

export interface OrderRequest {
  /** A label for the provider's own panels. */
  label: string;
  /** Hostinger catalog item, Contabo product id. */
  planRef: string;
  /** Hostinger data center id, Contabo region; null lets the provider pick. */
  regionRef: string | null;
  /** Hostinger template id, Contabo image id; null takes Ubuntu 24.04. */
  imageRef: string | null;
  /** The first-boot script (Hostinger post-install script; Hetzner and Contabo cloud-init user data). It also installs the operator's SSH keys. */
  script: string;
}

export interface OrderResult {
  orderRef: string | null;
  subscriptionRef: string | null;
  /** Null when the provider is still taking payment or creating it: look it up later by subscriptionRef. */
  machine: VirtualMachine | null;
  /** What was actually used, for the record and for a later setup. */
  regionRef: string | null;
  imageRef: string | null;
  /** A script stored at the provider, removed once the machine is up. */
  scriptRef: string | null;
}

export interface MachineRef {
  vmId: string | null;
  subscriptionRef: string | null;
}

export interface CancelResult {
  autoRenew: boolean;
  expiresAt: string | null;
}

export interface VpsProvider {
  readonly kind: VpsProviderKind;
  /** Spends money. Never called twice for the same machine. */
  order(request: OrderRequest): Promise<OrderResult>;
  /** The machine now, or null while the provider has not created it yet. */
  status(ref: MachineRef): Promise<VirtualMachine | null>;
  /** A machine that was paid for but not installed (Hostinger's `initial`): install it with the order's settings. */
  setup(vmId: string, request: OrderRequest & { scriptRef: string | null }): Promise<void>;
  /** Removes what the order left at the provider (the stored script). */
  cleanup(scriptRef: string): Promise<void>;
  /**
   * Stops paying for the machine. Hostinger: renewal off, it runs until the paid term ends. Contabo: cancelled at the end
   * of the term. Hetzner bills by the hour, so the server is deleted at once, with its disk: `deletesOnCancel`.
   */
  cancel(ref: MachineRef): Promise<CancelResult>;
  readonly deletesOnCancel: boolean;
}

/** A refusal from the provider. `ambiguous`: the call may have gone through (timeout, 5xx), so it must not be repeated blindly. */
export class VpsProviderError extends Error {
  readonly status: number | null;
  readonly ambiguous: boolean;
  constructor(message: string, status: number | null, ambiguous: boolean) {
    super(message);
    this.status = status;
    this.ambiguous = ambiguous;
  }
}

export interface JsonCall<T> {
  status: number;
  data: T;
}

/** One JSON request with the error rules both providers share. `secretFree` messages only: never echo a request. */
export async function jsonCall<T>(fetcher: typeof fetch, providerName: string, url: string, init: RequestInit): Promise<JsonCall<T>> {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    throw new VpsProviderError(`${providerName} sem resposta (${(error as Error).name})`, null, method !== "GET");
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const body = data as { message?: unknown; error?: { message?: unknown } } | null;
    const raw = body?.message ?? body?.error?.message;
    const message = typeof raw === "string" ? raw.slice(0, 300) : `HTTP ${response.status}`;
    throw new VpsProviderError(`${providerName}: ${message}`, response.status, method !== "GET" && response.status >= 500);
  }
  return { status: response.status, data: data as T };
}
