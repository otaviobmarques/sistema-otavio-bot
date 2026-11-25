// What the customer area offers and shows, in one place. No Node imports: the customer web app imports this too.

/**
 * The legal documents the customer accepts at onboarding. The version is the date the text took effect
 * ("Versão 1.0, em vigor a partir de 25/11/2026" in apps/site/conteudo/legal/*.md). When a text changes,
 * update the date here: customers who accepted an older version are asked to accept again.
 * test/customer.test.ts checks these dates against the Markdown files.
 */
export const LEGAL_DOCUMENTS = [
  { document: "terms", version: "2026-11-25", title: "Termos de Uso", url: "https://arkobot.com.br/termos/", source: "termos-de-uso.md" },
  { document: "privacy", version: "2026-11-25", title: "Política de Privacidade", url: "https://arkobot.com.br/privacidade/", source: "politica-de-privacidade.md" },
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

/** Same number as apps/site/src/config/contato.ts (checked by a test). */
export const SUPPORT_WHATSAPP = "5519987822290";
export const SUPPORT_WHATSAPP_DISPLAY = "+55 (19) 98782-2290";
export const SUPPORT_EMAIL = "contato@arkobot.com.br";

export function whatsappLink(message = "Olá! Preciso de ajuda com a minha conta do ArkoBot."): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
