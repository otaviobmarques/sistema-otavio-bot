export type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
export const BILLING_TYPES: readonly BillingType[] = ["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"];

export interface CustomerInput {
  name: string;
  /** CPF or CNPJ, digits only. Asaas refuses charges for a customer without one. */
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
  externalReference: string;
}

export interface SubscriptionInput {
  customerId: string;
  billingType: BillingType;
  valueCents: number;
  /** YYYY-MM-DD */
  nextDueDate: string;
  cycle: "MONTHLY" | "YEARLY";
  description: string;
  externalReference: string;
}

export interface ChargeInput {
  customerId: string;
  billingType: BillingType;
  valueCents: number;
  dueDate: string;
  description: string;
  externalReference: string;
}

export interface ProviderSubscription {
  id: string;
  status: string;
  nextDueDate: string | null;
}

export interface ProviderCharge {
  id: string;
  status: string;
  valueCents: number;
  dueDate: string | null;
  invoiceUrl: string | null;
  billingType: string | null;
}

export interface PixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
}

export interface CredentialCheck {
  ok: boolean;
  message: string;
}

/** What the Admin needs from a payment provider. Asaas is the only one today. */
export interface BillingProvider {
  createCustomer(input: CustomerInput): Promise<{ id: string }>;
  createSubscription(input: SubscriptionInput): Promise<ProviderSubscription>;
  updateSubscriptionValue(subscriptionId: string, valueCents: number, description: string): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  createCharge(input: ChargeInput): Promise<ProviderCharge>;
  pixQrCode(chargeId: string): Promise<PixQrCode>;
  checkCredentials(): Promise<CredentialCheck>;
}

export class ProviderError extends Error {
  readonly status: number;
  readonly details: string[];
  constructor(message: string, status: number, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** A normalised webhook event: what the processing code reads, whatever the provider's shape. */
export interface NormalizedPayment {
  id: string;
  subscriptionId: string | null;
  customerId: string | null;
  status: string;
  valueCents: number;
  billingType: string | null;
  dueDate: string | null;
  paidAt: string | null;
  invoiceUrl: string | null;
  externalReference: string | null;
}

export interface NormalizedEvent {
  id: string;
  type: string;
  payment: NormalizedPayment | null;
  subscription: { id: string; status: string | null; externalReference: string | null } | null;
}
