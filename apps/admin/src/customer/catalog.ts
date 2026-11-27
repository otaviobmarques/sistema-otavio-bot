// What the customer area offers and shows, in one place. No Node imports: the customer web app imports this too.

/**
 * The legal documents the customer accepts at onboarding. The version is the date the text took effect
 * ("Versão 1.1, em vigor a partir de 27/11/2026" in apps/site/conteudo/legal/*.md). When a text changes,
 * update the date here: customers who accepted an older version are asked to accept again.
 * test/customer.test.ts checks these dates against the Markdown files.
 */
export const LEGAL_DOCUMENTS = [
  { document: "terms", version: "2026-11-27", title: "Termos de Uso", url: "https://arkobot.com.br/termos/", source: "termos-de-uso.md" },
  { document: "privacy", version: "2026-11-27", title: "Política de Privacidade", url: "https://arkobot.com.br/privacidade/", source: "politica-de-privacidade.md" },
] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number]["document"];

/**
 * Credit packages sold in the customer area (1 crédito = R$ 0,01). The id is what the client sends;
 * the price is always computed on the server from the credits.
 */
export const CREDIT_PACKAGES = [
  { id: "5mil", credits: 5_000 },
  { id: "10mil", credits: 10_000 },
  { id: "25mil", credits: 25_000 },
] as const;

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]["id"];

/** The extra computer (VPS per bot) add-on, by its code in the `addons` table. */
export const EXTRA_COMPUTER_ADDON = "computador-adicional";
export const MAX_EXTRA_COMPUTERS = 50;

/** Payment methods a customer can pick. The card is typed on Asaas's own invoice page, never here. */
export const CUSTOMER_BILLING_TYPES = ["PIX", "BOLETO", "CREDIT_CARD"] as const;
export type CustomerBillingType = (typeof CUSTOMER_BILLING_TYPES)[number];

const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const dueDayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** The trial line on the customer's panel; `nextDueDate` is a YYYY-MM-DD date. */
export function trialNotice(trialEndsAt: string | Date, nextDueDate: string | null): string {
  const end = dayMonth.format(new Date(trialEndsAt));
  const due = nextDueDate ? dueDayMonth.format(new Date(`${nextDueDate.slice(0, 10)}T00:00:00Z`)) : end;
  return `Teste grátis até ${end} — a primeira cobrança vem em ${due}`;
}

/** The 7-day withdrawal right (CDC art. 49) counts from the contract; the refund itself is handled by the team. */
export const WITHDRAWAL_DAYS = 7;

export interface CancelableSubscription {
  status: string;
  courtesy: boolean;
  price_cents: number;
  created_at: string | Date;
  trial_ends_at: string | Date | null;
  current_period_end: string | Date | null;
}

export type CancelTiming =
  | { kind: "trial" | "withdrawal" | "unpaid" }
  | { kind: "period_end"; endsAt: Date };

/**
 * When a cancellation the customer asks for now takes effect. A paid, active subscription runs until midnight in
 * Brasília at the start of its period's end date (the next due date); the trial, the withdrawal window (refunded in
 * full) and anything not paid up end at once.
 */
export function cancelTiming(sub: CancelableSubscription, now: Date): CancelTiming {
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  if (trialEnd && trialEnd > now) return { kind: "trial" };
  if (now.getTime() - new Date(sub.created_at).getTime() <= WITHDRAWAL_DAYS * 86_400_000) return { kind: "withdrawal" };
  if (sub.status !== "active" || sub.courtesy || sub.price_cents <= 0 || !sub.current_period_end) return { kind: "unpaid" };
  const endsAt = new Date(`${new Date(sub.current_period_end).toISOString().slice(0, 10)}T03:00:00Z`);
  return endsAt > now ? { kind: "period_end", endsAt } : { kind: "unpaid" };
}

/** "Cancelamento agendado para 25/12": the day the ArkoBot is switched off. */
export function cancellationNotice(cancelAt: string | Date): string {
  return `Cancelamento agendado para ${dayMonth.format(new Date(cancelAt))}`;
}

/** The last day the ArkoBot still works before a scheduled cancellation, as dd/mm. */
export function lastPaidDay(cancelAt: string | Date): string {
  return dayMonth.format(new Date(new Date(cancelAt).getTime() - 1));
}

/** The plan ladder: what the next plan up unlocks, by plan code. Changing plans goes through support for now. */
export const PLAN_UPGRADES: Record<string, { code: string; name: string; unlocks: string }> = {
  inicial: { code: "essencial", name: "Essencial", unlocks: "bots que trabalham sozinhos + créditos de IA inclusos" },
  essencial: { code: "profissional", name: "Profissional", unlocks: "computador próprio" },
  profissional: { code: "empresa", name: "Empresa", unlocks: "várias empresas" },
};

/** Same number as apps/site/src/config/contato.ts (checked by a test). */
export const SUPPORT_WHATSAPP = "5519987822290";
export const SUPPORT_WHATSAPP_DISPLAY = "+55 (19) 98782-2290";
export const SUPPORT_EMAIL = "contato@arkobot.com.br";

export function whatsappLink(message = "Olá! Preciso de ajuda com a minha conta do ArkoBot."): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
