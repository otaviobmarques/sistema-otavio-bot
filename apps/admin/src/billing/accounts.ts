import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { AsaasClient, type AsaasEnvironment } from "./asaas.ts";
import type { BillingProvider } from "./provider.ts";

export interface BillingAccountRow {
  id: string;
  provider: "asaas";
  label: string;
  holder_type: "pf" | "pj";
  holder_name: string;
  holder_document: string;
  environment: AsaasEnvironment;
  api_key_enc: string;
  api_key_fingerprint: string;
  webhook_token_enc: string;
  can_issue_nfse: boolean;
  active_for_new: boolean;
  enabled: boolean;
  last_tested_at: Date | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
  created_at: Date;
}

export const apiKeyContext = (id: string) => `billing_accounts.api_key:${id}`;
export const webhookTokenContext = (id: string) => `billing_accounts.webhook_token:${id}`;

export async function billingAccount(q: Queryable, id: string): Promise<BillingAccountRow | null> {
  const { rows } = await q.query<BillingAccountRow>("SELECT * FROM billing_accounts WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function activeBillingAccount(q: Queryable): Promise<BillingAccountRow | null> {
  const { rows } = await q.query<BillingAccountRow>("SELECT * FROM billing_accounts WHERE active_for_new AND enabled LIMIT 1");
  return rows[0] ?? null;
}

export type ProviderFactory = (ctx: AppContext, account: BillingAccountRow) => BillingProvider;

export const defaultProviderFactory: ProviderFactory = (ctx, account) =>
  new AsaasClient({
    apiKey: ctx.box.decrypt(account.api_key_enc, apiKeyContext(account.id)),
    environment: account.environment,
    baseUrlOverride: ctx.config.asaasBaseUrlOverride,
    fetch: ctx.fetch,
  });

/** The public shape of a billing account: never the key or the webhook token. */
export function publicBillingAccount(row: BillingAccountRow) {
  return {
    id: row.id, provider: row.provider, label: row.label, holderType: row.holder_type, holderName: row.holder_name,
    holderDocument: row.holder_document, environment: row.environment, apiKeyFingerprint: row.api_key_fingerprint,
    canIssueNfse: row.can_issue_nfse, activeForNew: row.active_for_new, enabled: row.enabled,
    lastTestedAt: row.last_tested_at, lastTestOk: row.last_test_ok, lastTestMessage: row.last_test_message, createdAt: row.created_at,
  };
}
