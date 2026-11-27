// "Meus computadores" in the customer area: the organisation's own computers, in the customer's words. No provider
// names, addresses or costs: those are the operator's.
import type { AppContext } from "../context.ts";
import { DomainError } from "../domain/lifecycle.ts";
import type { CustomerRequest } from "./service.ts";

export type ComputerStatus = "preparing" | "ready" | "problem" | "ending";

export interface ComputerView {
  id: string;
  /** "home": where the customer's ArkoBot runs; "computer": an extra unit for the bots. */
  purpose: "home" | "computer";
  status: ComputerStatus;
  since: string;
  endsAt: string | null;
}

const STATUS: Record<string, ComputerStatus> = {
  awaiting_approval: "preparing", requested: "preparing", ordering: "preparing", provisioning: "preparing", running: "ready",
  stopped: "problem", failed: "problem", release_pending: "ending", released: "ending",
};

export async function computersView(ctx: AppContext, req: CustomerRequest): Promise<{ computers: ComputerView[] }> {
  const membership = (await ctx.db.query<{ organization_id: string }>(
    "SELECT organization_id FROM memberships WHERE account_id = $1 ORDER BY created_at LIMIT 1", [req.session.accountId])).rows[0];
  if (!membership) throw new DomainError("Complete o seu cadastro para continuar", 409);
  const { rows } = await ctx.db.query<{ id: string; purpose: "home" | "computer"; status: string; created_at: Date; expires_at: Date | null }>(
    `SELECT id, purpose, status, created_at, expires_at FROM vps_machines
     WHERE organization_id = $1 AND status NOT IN ('canceled', 'deleted') ORDER BY (purpose = 'home') DESC, created_at`, [membership.organization_id]);
  return {
    computers: rows.filter((row) => STATUS[row.status]).map((row) => ({
      id: row.id, purpose: row.purpose, status: STATUS[row.status]!, since: new Date(row.created_at).toISOString(),
      endsAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    })),
  };
}
