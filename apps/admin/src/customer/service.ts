import { audit, type Actor } from "../audit.ts";
import { hit } from "../auth/rate-limit.ts";
import { activeBillingAccount, defaultProviderFactory, type ProviderFactory } from "../billing/accounts.ts";
import {
  cancelSubscription, CENTS_PER_CREDIT, createCreditCharge, setSubscriptionAddon, startSubscription, syncSubscriptionPayments, type CreditChargeResult,
} from "../billing/service.ts";
import { isoDate } from "../billing/subscription-machine.ts";
import type { AppContext } from "../context.ts";
import { isUniqueViolation, type Queryable } from "../db/db.ts";
import { digitsOnly, parseDocument, type DocumentType } from "../domain/documents.ts";
import { DomainError, type OrganizationRow, type SubscriptionRow } from "../domain/lifecycle.ts";
import { DUPLICATE_DOCUMENT, insertOrganization } from "../domain/organizations.ts";
import type { SessionCustomer } from "./auth.ts";
import {
  CREDIT_PACKAGES, EXTRA_COMPUTER_ADDON, LEGAL_DOCUMENTS, MAX_EXTRA_COMPUTERS, type CreditPackageId, type CustomerBillingType,
} from "./catalog.ts";

export type MemberRole = "owner" | "admin" | "member";

export interface CustomerRequest {
  session: SessionCustomer;
  ip: string;
  userAgent: string | null;
}

export function customerActor(req: CustomerRequest): Actor {
  return { type: "customer", id: req.session.accountId, label: req.session.email, ip: req.ip };
}

/** Limits on what a signed-in customer may start at the provider, per account. */
export const CUSTOMER_LIMITS = {
  charges: { windowMs: 60 * 60_000, max: 10 },
  exports: { windowMs: 60 * 60_000, max: 10 },
};

interface Membership {
  organization_id: string;
  role: MemberRole;
}

/** Every read and write of the customer area goes through this: the one organisation the account belongs to. */
async function membershipOf(q: Queryable, accountId: string): Promise<Membership | null> {
  const { rows } = await q.query<Membership>(
    `SELECT organization_id, role FROM memberships WHERE account_id = $1
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at LIMIT 1`, [accountId]);
  return rows[0] ?? null;
}

async function requireMembership(q: Queryable, accountId: string, write: boolean): Promise<Membership> {
  const membership = await membershipOf(q, accountId);
  if (!membership) throw new DomainError("Complete o seu cadastro para continuar", 409);
  if (write && membership.role === "member") throw new DomainError("Só o responsável pela conta da empresa pode fazer isso", 403);
  return membership;
}

async function pendingDocuments(q: Queryable, accountId: string) {
  const { rows } = await q.query<{ document: string; version: string }>(
    "SELECT DISTINCT document, version FROM terms_acceptances WHERE account_id = $1", [accountId]);
  const accepted = new Set(rows.map((row) => `${row.document}:${row.version}`));
  return LEGAL_DOCUMENTS.filter((doc) => !accepted.has(`${doc.document}:${doc.version}`));
}

async function currentSubscription(q: Queryable, organizationId: string): Promise<SubscriptionRow | null> {
  const { rows } = await q.query<SubscriptionRow>(
    "SELECT * FROM subscriptions WHERE organization_id = $1 AND status <> 'canceled'", [organizationId]);
  return rows[0] ?? null;
}

/** What the customer app needs to decide where to send the customer next. */
export async function customerState(ctx: AppContext, session: SessionCustomer) {
  const membership = await membershipOf(ctx.db, session.accountId);
  const pending = await pendingDocuments(ctx.db, session.accountId);
  let organization: Pick<OrganizationRow, "id" | "name" | "document_type" | "document" | "status"> | null = null;
  let subscriptionStatus: string | null = null;
  if (membership) {
    organization = (await ctx.db.query<OrganizationRow>(
      "SELECT id, name, document_type, document, status FROM organizations WHERE id = $1", [membership.organization_id])).rows[0] ?? null;
    const { rows } = await ctx.db.query<{ status: string }>(
      "SELECT status FROM subscriptions WHERE organization_id = $1 ORDER BY (status = 'canceled'), created_at DESC LIMIT 1", [membership.organization_id]);
    subscriptionStatus = rows[0]?.status ?? null;
  }
  return {
    account: { email: session.email, name: session.name, phone: session.phone },
    organization,
    role: membership?.role ?? null,
    subscriptionStatus,
    needsOnboarding: !membership || pending.length > 0 || !session.name.trim(),
    pendingDocuments: pending.map((doc) => doc.document),
  };
}

export interface OnboardingInput {
  name: string;
  phone: string;
  companyName?: string;
  documentType?: DocumentType;
  document?: string;
  acceptTerms: boolean;
}

export function normalizePhone(raw: string): string | null {
  let digits = digitsOnly(raw);
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  return /^[1-9][0-9][2-9][0-9]{7,8}$/.test(digits) ? digits : null;
}

/**
 * The first-login form: profile, the company (unless the account already belongs to one) and the
 * acceptance of the current Terms and Privacy Policy, recorded with IP and user agent. One transaction.
 */
export async function completeOnboarding(ctx: AppContext, req: CustomerRequest, input: OnboardingInput): Promise<void> {
  if (input.acceptTerms !== true) throw new DomainError("Para continuar, aceite os Termos de Uso e a Política de Privacidade");
  const name = input.name.trim();
  if (name.length < 2) throw new DomainError("Informe o seu nome");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new DomainError("Telefone inválido: informe DDD e número");
  const actor = customerActor(req);
  try {
    await ctx.db.tx(async (q) => {
      await q.query("UPDATE accounts SET name = $2, phone = $3 WHERE id = $1", [req.session.accountId, name, phone]);
      let membership = await membershipOf(q, req.session.accountId);
      if (!membership) {
        const companyName = input.companyName?.trim() ?? "";
        if (companyName.length < 2) throw new DomainError("Informe o nome da empresa (ou o seu nome, se for pessoa física)");
        const document = parseDocument(input.document ?? "");
        if (!document) throw new DomainError(input.documentType === "cnpj" ? "CNPJ inválido: confira os números" : "CPF inválido: confira os números");
        if (input.documentType && document.type !== input.documentType) {
          throw new DomainError(input.documentType === "cnpj" ? "Esse número é um CPF; escolha CPF ou informe um CNPJ" : "Esse número é um CNPJ; escolha CNPJ ou informe um CPF");
        }
        const org = await insertOrganization(q, actor, {
          name: companyName, document: document.digits, ownerEmail: req.session.email, ownerName: name, phone, billingEmail: req.session.email,
        });
        membership = { organization_id: org.id, role: "owner" };
      }
      for (const doc of await pendingDocuments(q, req.session.accountId)) {
        await q.query(
          `INSERT INTO terms_acceptances (account_id, organization_id, document, version, accepted_at, ip, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.session.accountId, membership.organization_id, doc.document, doc.version, ctx.now(), req.ip, req.userAgent?.slice(0, 300) ?? null]);
        await audit(q, actor, { action: "terms.accepted", targetType: "account", targetId: req.session.accountId,
          organizationId: membership.organization_id, data: { document: doc.document, version: doc.version } });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError(`${DUPLICATE_DOCUMENT}. Se for o seu, fale com a gente para recuperar o acesso.`, 409);
    throw error;
  }
}

export async function planCatalog(ctx: AppContext) {
  const [plans, addon, account] = await Promise.all([
    ctx.db.query(
      `SELECT id, code, name, description, price_cents, billing_cycle, credits_per_month, max_bots, max_companies, included_vps
       FROM plans WHERE active AND visible AND NOT free ORDER BY sort_order, price_cents`),
    ctx.db.query<{ id: string; code: string; name: string; description: string; price_cents: number }>(
      "SELECT id, code, name, description, price_cents FROM addons WHERE code = $1 AND active", [EXTRA_COMPUTER_ADDON]),
    activeBillingAccount(ctx.db),
  ]);
  return {
    plans: plans.rows,
    extraComputer: addon.rows[0] ?? null,
    creditPackages: CREDIT_PACKAGES.map((pkg) => ({ ...pkg, priceCents: pkg.credits * CENTS_PER_CREDIT })),
    paymentsAvailable: account !== null,
  };
}

async function requireReadyToPay(ctx: AppContext, req: CustomerRequest): Promise<Membership> {
  const membership = await requireMembership(ctx.db, req.session.accountId, true);
  if ((await pendingDocuments(ctx.db, req.session.accountId)).length) throw new DomainError("Aceite os Termos de Uso e a Política de Privacidade para continuar", 409);
  if (!(await activeBillingAccount(ctx.db))) {
    throw new DomainError("Pagamentos ainda não estão disponíveis. Fale com a gente pelo WhatsApp que ativamos a sua conta.", 409);
  }
  return membership;
}

async function limitCharges(ctx: AppContext, accountId: string) {
  if (!(await hit(ctx.db, `conta-charges:${accountId}`, CUSTOMER_LIMITS.charges, ctx.now()))) {
    throw new DomainError("Muitas cobranças geradas em pouco tempo. Aguarde um pouco ou fale com a gente.", 429);
  }
}

async function extraComputerAddonId(q: Queryable): Promise<string> {
  const addon = (await q.query<{ id: string }>("SELECT id FROM addons WHERE code = $1 AND active", [EXTRA_COMPUTER_ADDON])).rows[0];
  if (!addon) throw new DomainError("O computador adicional não está disponível no momento");
  return addon.id;
}

async function openInvoiceUrl(q: Queryable, subscriptionId: string): Promise<string | null> {
  const { rows } = await q.query<{ invoice_url: string | null }>(
    `SELECT invoice_url FROM payments WHERE subscription_id = $1 AND status IN ('pending', 'overdue') AND invoice_url IS NOT NULL
     ORDER BY due_date NULLS LAST, created_at LIMIT 1`, [subscriptionId]);
  return rows[0]?.invoice_url ?? null;
}

export interface SubscribeInput {
  planCode: string;
  extraComputers: number;
  billingType: CustomerBillingType;
}

/** Signup's last step: the subscription at Asaas, the extra computers, and the link to the first invoice. */
export async function subscribe(ctx: AppContext, req: CustomerRequest, input: SubscribeInput, factory: ProviderFactory = defaultProviderFactory) {
  if (!Number.isInteger(input.extraComputers) || input.extraComputers < 0 || input.extraComputers > MAX_EXTRA_COMPUTERS) {
    throw new DomainError(`Escolha de 0 a ${MAX_EXTRA_COMPUTERS} computadores adicionais`);
  }
  const membership = await requireReadyToPay(ctx, req);
  const plan = (await ctx.db.query<{ id: string }>("SELECT id FROM plans WHERE code = $1 AND active AND visible AND NOT free", [input.planCode])).rows[0];
  if (!plan) throw new DomainError("Plano inexistente");
  const addonId = input.extraComputers > 0 ? await extraComputerAddonId(ctx.db) : null;
  await limitCharges(ctx, req.session.accountId);
  const actor = customerActor(req);
  // A boleto due today could not be paid in time; Pix and card are paid on the spot.
  const firstDueDate = isoDate(input.billingType === "BOLETO" ? new Date(ctx.now().getTime() + 3 * 86_400_000) : ctx.now());
  const sub = await startSubscription(ctx, actor, { organizationId: membership.organization_id, planId: plan.id, billingType: input.billingType, firstDueDate }, factory);
  if (addonId) await setSubscriptionAddon(ctx, actor, sub.id, addonId, input.extraComputers, factory);
  await syncSubscriptionPayments(ctx, sub.id, factory).catch((error) => console.error("[conta] fatura inicial", (error as Error).message));
  return { subscriptionId: sub.id, status: sub.status, invoiceUrl: await openInvoiceUrl(ctx.db, sub.id) };
}

const PAYMENT_FIELDS = `p.id, p.kind, p.status, p.billing_type, p.value_cents, p.credits, p.due_date, p.paid_at, p.invoice_url,
  CASE WHEN p.status = 'pending' THEN p.pix_payload END AS pix_payload, p.created_at`;

/** The customer's panel: only the rows of the organisation the session's account belongs to. */
export async function dashboard(ctx: AppContext, req: CustomerRequest, factory: ProviderFactory = defaultProviderFactory) {
  const membership = await requireMembership(ctx.db, req.session.accountId, false);
  const orgId = membership.organization_id;
  const sub = await currentSubscription(ctx.db, orgId);
  if (sub?.status === "pending") {
    const known = await ctx.db.query("SELECT 1 FROM payments WHERE subscription_id = $1 LIMIT 1", [sub.id]);
    if (!known.rows.length) await syncSubscriptionPayments(ctx, sub.id, factory).catch(() => undefined);
  }
  const [org, subscription, addons, payments, wallet, ledger, deletion, catalog] = await Promise.all([
    ctx.db.query("SELECT id, name, document_type, document, status, status_reason_code, created_at FROM organizations WHERE id = $1", [orgId]),
    ctx.db.query(
      `SELECT s.id, s.status, s.billing_type, s.price_cents, s.credits_per_month, s.current_period_start, s.current_period_end, s.next_due_date,
         s.past_due_since, s.canceled_at, s.created_at, p.code AS plan_code, p.name AS plan_name, p.included_vps,
         (s.price_cents + COALESCE((SELECT SUM(a.quantity * a.unit_price_cents) FROM subscription_addons a WHERE a.subscription_id = s.id), 0))::int AS total_cents
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.organization_id = $1 ORDER BY (s.status = 'canceled'), s.created_at DESC LIMIT 1`, [orgId]),
    sub
      ? ctx.db.query(`SELECT ad.code, ad.name, sa.quantity, sa.unit_price_cents FROM subscription_addons sa JOIN addons ad ON ad.id = sa.addon_id
                      WHERE sa.subscription_id = $1`, [sub.id])
      : Promise.resolve({ rows: [] }),
    ctx.db.query(`SELECT ${PAYMENT_FIELDS} FROM payments p WHERE p.organization_id = $1 ORDER BY p.created_at DESC LIMIT 50`, [orgId]),
    ctx.db.query<{ plan_balance: number; extra_balance: number }>("SELECT plan_balance, extra_balance FROM credit_wallets WHERE organization_id = $1", [orgId]),
    ctx.db.query(`SELECT id, created_at, bucket, kind, amount, balance_after FROM credit_ledger WHERE organization_id = $1 ORDER BY id DESC LIMIT 100`, [orgId]),
    ctx.db.query("SELECT id, status, created_at, resolved_at FROM account_deletion_requests WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1", [req.session.accountId]),
    planCatalog(ctx),
  ]);
  return {
    organization: org.rows[0],
    role: membership.role,
    subscription: subscription.rows[0] ?? null,
    addons: addons.rows,
    payments: payments.rows,
    wallet: { plan: Number(wallet.rows[0]?.plan_balance ?? 0), extra: Number(wallet.rows[0]?.extra_balance ?? 0) },
    ledger: ledger.rows,
    deletionRequest: deletion.rows[0] ?? null,
    extraComputer: catalog.extraComputer,
    creditPackages: catalog.creditPackages,
    paymentsAvailable: catalog.paymentsAvailable,
  };
}

export async function buyCredits(
  ctx: AppContext, req: CustomerRequest, input: { packageId: CreditPackageId; billingType: CustomerBillingType }, factory: ProviderFactory = defaultProviderFactory,
): Promise<CreditChargeResult> {
  const pkg = CREDIT_PACKAGES.find((item) => item.id === input.packageId);
  if (!pkg) throw new DomainError("Pacote de créditos inexistente");
  const membership = await requireReadyToPay(ctx, req);
  if (!(await currentSubscription(ctx.db, membership.organization_id))) throw new DomainError("Assine um plano antes de comprar créditos avulsos", 409);
  await limitCharges(ctx, req.session.accountId);
  return createCreditCharge(ctx, customerActor(req), { organizationId: membership.organization_id, credits: pkg.credits, billingType: input.billingType }, factory);
}

export async function setExtraComputers(ctx: AppContext, req: CustomerRequest, quantity: number, factory: ProviderFactory = defaultProviderFactory): Promise<number> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_EXTRA_COMPUTERS) throw new DomainError(`Escolha de 0 a ${MAX_EXTRA_COMPUTERS} computadores adicionais`);
  const membership = await requireMembership(ctx.db, req.session.accountId, true);
  const sub = await currentSubscription(ctx.db, membership.organization_id);
  if (!sub) throw new DomainError("Você não tem uma assinatura em andamento", 404);
  return setSubscriptionAddon(ctx, customerActor(req), sub.id, await extraComputerAddonId(ctx.db), quantity, factory);
}

/** The 7-day withdrawal right (CDC art. 49) counts from the contract; the refund itself is handled by the team. */
export const WITHDRAWAL_DAYS = 7;

export async function cancelOwnSubscription(ctx: AppContext, req: CustomerRequest, reason: string, factory: ProviderFactory = defaultProviderFactory) {
  const membership = await requireMembership(ctx.db, req.session.accountId, true);
  const sub = await currentSubscription(ctx.db, membership.organization_id);
  if (!sub) throw new DomainError("Você não tem uma assinatura em andamento", 404);
  const created = (await ctx.db.query<{ created_at: Date }>("SELECT created_at FROM subscriptions WHERE id = $1", [sub.id])).rows[0]!.created_at;
  const withinWithdrawal = ctx.now().getTime() - created.getTime() <= WITHDRAWAL_DAYS * 86_400_000;
  const text = `Cancelado pelo cliente: ${reason.trim()}`.slice(0, 500);
  await cancelSubscription(ctx, customerActor(req), sub.id, text, factory);
  await audit(ctx.db, customerActor(req), {
    action: "subscription.canceled_by_customer", targetType: "subscription", targetId: sub.id, organizationId: membership.organization_id,
    reason: reason.trim().slice(0, 500), data: { withinWithdrawalPeriod: withinWithdrawal },
  });
  return { withinWithdrawalPeriod: withinWithdrawal };
}

/** LGPD art. 18 (access and portability): what the platform holds about the account and its organisation. */
export async function exportData(ctx: AppContext, req: CustomerRequest) {
  if (!(await hit(ctx.db, `conta-export:${req.session.accountId}`, CUSTOMER_LIMITS.exports, ctx.now()))) {
    throw new DomainError("Muitas exportações em pouco tempo. Tente de novo mais tarde.", 429);
  }
  const accountId = req.session.accountId;
  const membership = await membershipOf(ctx.db, accountId);
  const orgId = membership?.organization_id ?? null;
  const byOrg = (sql: string) => (orgId ? ctx.db.query(sql, [orgId]).then((r) => r.rows) : Promise.resolve([]));
  const [account, organizations, terms, sessions, deletions, subscriptions, addons, payments, wallet, ledger] = await Promise.all([
    ctx.db.query("SELECT id, email, name, phone, created_at, updated_at FROM accounts WHERE id = $1", [accountId]).then((r) => r.rows[0]),
    ctx.db.query(
      `SELECT o.id, o.name, o.document_type, o.document, o.billing_email, o.phone, o.status, o.created_at, m.role
       FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.account_id = $1`, [accountId]).then((r) => r.rows),
    ctx.db.query("SELECT document, version, accepted_at, ip, user_agent FROM terms_acceptances WHERE account_id = $1 ORDER BY accepted_at", [accountId]).then((r) => r.rows),
    ctx.db.query("SELECT created_at, last_seen_at, expires_at, revoked_at, ip, user_agent FROM account_sessions WHERE account_id = $1 ORDER BY created_at", [accountId]).then((r) => r.rows),
    ctx.db.query("SELECT status, reason, created_at, resolved_at FROM account_deletion_requests WHERE account_id = $1 ORDER BY created_at", [accountId]).then((r) => r.rows),
    byOrg(`SELECT s.id, p.name AS plan, s.status, s.billing_type, s.price_cents, s.credits_per_month, s.current_period_start, s.current_period_end,
             s.next_due_date, s.canceled_at, s.cancel_reason, s.created_at FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           WHERE s.organization_id = $1 ORDER BY s.created_at`),
    byOrg(`SELECT ad.name, sa.quantity, sa.unit_price_cents, sa.created_at FROM subscription_addons sa JOIN addons ad ON ad.id = sa.addon_id
           JOIN subscriptions s ON s.id = sa.subscription_id WHERE s.organization_id = $1`),
    byOrg(`SELECT kind, status, billing_type, value_cents, credits, due_date, paid_at, invoice_url, created_at FROM payments
           WHERE organization_id = $1 ORDER BY created_at`),
    byOrg("SELECT plan_balance, extra_balance, updated_at FROM credit_wallets WHERE organization_id = $1"),
    byOrg("SELECT created_at, bucket, kind, amount, balance_after FROM credit_ledger WHERE organization_id = $1 ORDER BY id"),
  ]);
  await audit(ctx.db, customerActor(req), { action: "account.data_exported", targetType: "account", targetId: accountId, organizationId: orgId });
  return {
    exportedAt: ctx.now().toISOString(),
    controller: "Domma Tecnologia e Desenvolvimento de Softwares Ltda (ArkoBot), CNPJ 70.075.405/0001-74",
    account, organizations, termsAcceptances: terms, sessions, deletionRequests: deletions,
    subscriptions, subscriptionAddons: addons, payments, creditWallet: wallet[0] ?? null, creditLedger: ledger,
  };
}

/**
 * Records the request for the operator; nothing is deleted here. Payments, invoices and the credit
 * ledger are kept for the legally required period whatever the outcome.
 */
export async function requestDeletion(ctx: AppContext, req: CustomerRequest, reason: string | null) {
  const membership = await membershipOf(ctx.db, req.session.accountId);
  try {
    return await ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ id: string; created_at: Date }>(
        `INSERT INTO account_deletion_requests (account_id, organization_id, reason, ip, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [req.session.accountId, membership?.organization_id ?? null, reason?.trim().slice(0, 1000) || null, req.ip, req.userAgent?.slice(0, 300) ?? null, ctx.now()]);
      await audit(q, customerActor(req), {
        action: "account.deletion_requested", targetType: "account", targetId: req.session.accountId,
        organizationId: membership?.organization_id ?? null, reason: reason?.trim().slice(0, 500) || null, data: { requestId: rows[0]!.id },
      });
      return rows[0]!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("Você já pediu a exclusão da conta; nossa equipe está cuidando disso.", 409);
    throw error;
  }
}
