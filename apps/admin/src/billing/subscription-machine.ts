export type SubscriptionStatus = "pending" | "active" | "past_due" | "suspended" | "canceled";

export type BillingSignal =
  | "payment_paid"
  | "payment_overdue"
  | "payment_refunded"
  | "chargeback"
  | "provider_ended"
  | "dunning_suspend"
  | "dunning_cancel"
  | "admin_cancel"
  | "courtesy_expired";

/**
 * The subscription's next status for a signal, or null when the signal leaves
 * it as it is. Canceled is terminal: a late payment on a canceled subscription
 * is recorded but does not bring it back (the operator starts a new one).
 */
export function nextSubscriptionStatus(current: SubscriptionStatus, signal: BillingSignal): SubscriptionStatus | null {
  if (current === "canceled") return null;
  switch (signal) {
    case "payment_paid":
      return current === "active" ? null : "active";
    case "payment_overdue":
      return current === "pending" || current === "active" ? "past_due" : null;
    case "payment_refunded":
      return null;
    case "chargeback":
      return current === "suspended" ? null : "suspended";
    case "provider_ended":
    case "admin_cancel":
    case "courtesy_expired":
      return "canceled";
    case "dunning_suspend":
      return current === "past_due" ? "suspended" : null;
    case "dunning_cancel":
      return current === "suspended" ? "canceled" : null;
  }
}

/** Asaas payment status → our payment status. Unknown statuses keep the current one. */
export function paymentStatusFromAsaas(status: string): "pending" | "confirmed" | "received" | "overdue" | "refunded" | "chargeback" | null {
  switch (status) {
    case "PENDING":
    case "AWAITING_RISK_ANALYSIS":
      return "pending";
    case "CONFIRMED":
      return "confirmed";
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "received";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return "refunded";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "chargeback";
    default:
      return null;
  }
}

/** Whether a payment in `status` already counts as paid; an overdue notice arriving after the payment is stale. */
export function isPaid(status: string): boolean {
  return status === "confirmed" || status === "received";
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const BRASILIA_OFFSET_MS = 3 * 60 * 60_000;

/** Today's date in Brasília (UTC−3, no daylight saving since 2019), as YYYY-MM-DD. */
export function brasiliaDate(now: Date): string {
  return isoDate(new Date(now.getTime() - BRASILIA_OFFSET_MS));
}
