import { randomUUID } from "node:crypto";
import { audit, type Actor } from "../audit.ts";
import type { AppContext } from "../context.ts";
import { isUniqueViolation } from "../db/db.ts";
import { postLedger, type Bucket } from "../credits/ledger.ts";
import { parseDocument, slugify } from "./documents.ts";
import { DomainError, type OrganizationRow } from "./lifecycle.ts";

export interface NewOrganization {
  name: string;
  document: string;
  ownerEmail: string;
  ownerName: string;
  phone?: string | null;
  billingEmail?: string | null;
}

export async function createOrganization(ctx: AppContext, actor: Actor, input: NewOrganization): Promise<OrganizationRow> {
  const document = parseDocument(input.document);
  if (!document) throw new DomainError("CPF ou CNPJ inválido");
  const email = input.ownerEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError("E-mail do responsável inválido");
  try {
    return await ctx.db.tx(async (q) => {
      const account = await q.query<{ id: string }>(
        `INSERT INTO accounts (email, name, phone) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = CASE WHEN accounts.name = '' THEN excluded.name ELSE accounts.name END
         RETURNING id`,
        [email, input.ownerName.trim(), input.phone ?? null]);
      let slug = slugify(input.name);
      const taken = await q.query("SELECT 1 FROM organizations WHERE slug = $1", [slug]);
      if (taken.rows.length) slug = `${slug.slice(0, 54)}-${randomUUID().slice(0, 6)}`;
      const { rows } = await q.query<OrganizationRow>(
        `INSERT INTO organizations (name, slug, document_type, document, billing_email, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [input.name.trim(), slug, document.type, document.digits, input.billingEmail?.trim().toLowerCase() || null, input.phone ?? null]);
      const org = rows[0]!;
      await q.query("INSERT INTO memberships (organization_id, account_id, role) VALUES ($1, $2, 'owner')", [org.id, account.rows[0]!.id]);
      await q.query("INSERT INTO credit_wallets (organization_id) VALUES ($1)", [org.id]);
      await audit(q, actor, { action: "organization.created", targetType: "organization", targetId: org.id, organizationId: org.id,
        data: { name: org.name, documentType: org.document_type, ownerEmail: email } });
      return org;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("Já existe um cliente com este CPF/CNPJ", 409);
    throw error;
  }
}

/** A manual credit adjustment: one ledger row and one audit row, both with the operator's reason. */
export async function adjustCredits(
  ctx: AppContext, actor: Actor & { id: string }, input: { organizationId: string; bucket: Bucket; amount: number; reason: string },
): Promise<number> {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new DomainError("Informe um valor inteiro de créditos diferente de zero");
  if (input.reason.trim().length < 5) throw new DomainError("Explique o motivo do ajuste");
  return ctx.db.tx(async (q) => {
    const org = await q.query("SELECT 1 FROM organizations WHERE id = $1", [input.organizationId]);
    if (!org.rows.length) throw new DomainError("Cliente não encontrado", 404);
    const reference = `admin:${randomUUID()}`;
    const post = await postLedger(q, {
      organizationId: input.organizationId, bucket: input.bucket, kind: "admin_adjust", amount: input.amount,
      externalReference: reference, adminId: actor.id, reason: input.reason.trim(),
    }).catch((error: Error) => {
      throw new DomainError(error.message);
    });
    await audit(q, actor, { action: "credits.adjusted", targetType: "organization", targetId: input.organizationId,
      organizationId: input.organizationId, reason: input.reason.trim(),
      data: { bucket: input.bucket, amount: input.amount, balanceAfter: post.balanceAfter, ledgerReference: reference } });
    return post.balanceAfter;
  });
}
