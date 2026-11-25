import type {
  BillingProvider, ChargeInput, CredentialCheck, CustomerInput, NormalizedEvent, PixQrCode, ProviderCharge, ProviderSubscription,
  SubscriptionInput,
} from "./provider.ts";
import { ProviderError } from "./provider.ts";

// Asaas API v3 (docs.asaas.com). The key goes in the `access_token` header; accounts created
// since 2024 also need a User-Agent. Amounts are decimal reais; dates are YYYY-MM-DD.
export const ASAAS_BASE_URLS = {
  production: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
} as const;

export type AsaasEnvironment = keyof typeof ASAAS_BASE_URLS;

const USER_AGENT = "ArkoBot-Admin/0.1";
const TIMEOUT_MS = 20_000;

export interface AsaasOptions {
  apiKey: string;
  environment: AsaasEnvironment;
  baseUrlOverride?: string;
  fetch?: typeof fetch;
}

const toReais = (cents: number) => Math.round(cents) / 100;
const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function chargeFrom(data: Record<string, unknown>): ProviderCharge {
  return {
    id: String(data.id), status: String(data.status ?? "PENDING"), valueCents: toCents(data.value), dueDate: str(data.dueDate),
    invoiceUrl: str(data.invoiceUrl), billingType: str(data.billingType),
  };
}

export class AsaasClient implements BillingProvider {
  readonly #apiKey: string;
  readonly #base: string;
  readonly #fetch: typeof fetch;

  constructor(options: AsaasOptions) {
    if (!options.apiKey) throw new Error("Chave de API do Asaas ausente");
    this.#apiKey = options.apiKey;
    this.#base = (options.baseUrlOverride ?? ASAAS_BASE_URLS[options.environment]).replace(/\/+$/, "");
    this.#fetch = options.fetch ?? fetch;
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#base}${path}`, {
        method,
        headers: {
          access_token: this.#apiKey,
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderError(`Asaas não respondeu: ${(error as Error).message}`, 0);
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const errors = (data as { errors?: { code?: string; description?: string }[] } | null)?.errors ?? [];
      const details = errors.map((error) => error.description ?? error.code ?? "").filter(Boolean);
      const message = response.status === 401 ? "Chave de API do Asaas inválida ou sem permissão" : details[0] ?? `Asaas respondeu ${response.status}`;
      throw new ProviderError(message, response.status, details);
    }
    return data as T;
  }

  async createCustomer(input: CustomerInput): Promise<{ id: string }> {
    if (!/^(\d{11}|\d{14})$/.test(input.cpfCnpj)) throw new ProviderError("CPF ou CNPJ é obrigatório para criar o cliente no Asaas", 400);
    const data = await this.#request<{ id: string }>("POST", "/customers", {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      ...(input.email ? { email: input.email } : {}),
      ...(input.mobilePhone ? { mobilePhone: input.mobilePhone } : {}),
      externalReference: input.externalReference,
      notificationDisabled: false,
    });
    return { id: data.id };
  }

  async createSubscription(input: SubscriptionInput): Promise<ProviderSubscription> {
    const data = await this.#request<Record<string, unknown>>("POST", "/subscriptions", {
      customer: input.customerId,
      billingType: input.billingType,
      value: toReais(input.valueCents),
      nextDueDate: input.nextDueDate,
      cycle: input.cycle,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
    });
    return { id: String(data.id), status: String(data.status ?? "ACTIVE"), nextDueDate: str(data.nextDueDate) };
  }

  async updateSubscriptionValue(subscriptionId: string, valueCents: number, description: string): Promise<void> {
    await this.#request("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      value: toReais(valueCents),
      description: description.slice(0, 500),
      updatePendingPayments: true,
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.#request("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  async createCharge(input: ChargeInput): Promise<ProviderCharge> {
    const data = await this.#request<Record<string, unknown>>("POST", "/payments", {
      customer: input.customerId,
      billingType: input.billingType,
      value: toReais(input.valueCents),
      dueDate: input.dueDate,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
    });
    return chargeFrom(data);
  }

  async subscriptionPayments(subscriptionId: string): Promise<ProviderCharge[]> {
    const data = await this.#request<{ data?: Record<string, unknown>[] }>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=20`);
    return (data?.data ?? []).map(chargeFrom);
  }

  async pixQrCode(chargeId: string): Promise<PixQrCode> {
    const data = await this.#request<Record<string, unknown>>("GET", `/payments/${encodeURIComponent(chargeId)}/pixQrCode`);
    return { encodedImage: String(data.encodedImage ?? ""), payload: String(data.payload ?? ""), expirationDate: str(data.expirationDate) };
  }

  async checkCredentials(): Promise<CredentialCheck> {
    try {
      const data = await this.#request<{ balance?: number }>("GET", "/finance/balance");
      return { ok: true, message: `Conectado. Saldo: R$ ${Number(data?.balance ?? 0).toFixed(2).replace(".", ",")}` };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}

/** Reads an Asaas webhook body into the shape the processor uses; null when it is not one. */
export function normalizeAsaasEvent(body: unknown): NormalizedEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const id = str(raw.id);
  const type = str(raw.event);
  if (!id || !type) return null;
  const payment = raw.payment as Record<string, unknown> | undefined;
  const subscription = raw.subscription as Record<string, unknown> | undefined;
  return {
    id,
    type,
    payment: payment && str(payment.id)
      ? {
        id: String(payment.id),
        subscriptionId: str(payment.subscription),
        customerId: str(payment.customer),
        status: String(payment.status ?? ""),
        valueCents: toCents(payment.value),
        billingType: str(payment.billingType),
        dueDate: str(payment.dueDate),
        paidAt: str(payment.clientPaymentDate) ?? str(payment.paymentDate) ?? str(payment.confirmedDate),
        invoiceUrl: str(payment.invoiceUrl),
        externalReference: str(payment.externalReference),
      }
      : null,
    subscription: subscription && str(subscription.id)
      ? { id: String(subscription.id), status: str(subscription.status), externalReference: str(subscription.externalReference) }
      : null,
  };
}
