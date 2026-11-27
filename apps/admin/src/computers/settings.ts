// The "Computadores" settings (vps_settings, one row) and the provider each machine is bought from.
import type { AppContext } from "../context.ts";
import type { Queryable } from "../db/db.ts";
import { ContaboProvider } from "./contabo.ts";
import { HetznerProvider } from "./hetzner.ts";
import { HostingerProvider } from "./hostinger.ts";
import type { VpsProvider, VpsProviderKind } from "./provider.ts";

export interface VpsSettingsRow {
  auto_purchase: boolean;
  provider: VpsProviderKind;
  hetzner_server_type: string;
  hetzner_location: string;
  hetzner_image: string | null;
  hetzner_monthly_cost_cents: number;
  hostinger_item_id: string;
  hostinger_template_id: number | null;
  hostinger_data_center_id: number | null;
  hostinger_monthly_cost_cents: number;
  hostinger_setup_fee_cents: number;
  contabo_product_id: string;
  contabo_region: string;
  contabo_image_id: string | null;
  contabo_monthly_cost_cents: number;
  contabo_setup_fee_cents: number;
  updated_at: Date;
}

export async function vpsSettings(q: Queryable): Promise<VpsSettingsRow> {
  const { rows } = await q.query<VpsSettingsRow>("SELECT * FROM vps_settings WHERE id");
  if (!rows[0]) throw new Error("vps_settings sem a linha de configuração (rode as migrações)");
  return rows[0];
}

/** What to ask the chosen provider for, and what it costs us. */
export interface OrderPlan {
  provider: VpsProviderKind;
  planRef: string;
  regionRef: string | null;
  imageRef: string | null;
  monthlyCostCents: number;
  setupFeeCents: number;
}

export function orderPlan(settings: VpsSettingsRow): OrderPlan {
  switch (settings.provider) {
    case "hetzner":
      return { provider: "hetzner", planRef: settings.hetzner_server_type, regionRef: settings.hetzner_location, imageRef: settings.hetzner_image,
        monthlyCostCents: settings.hetzner_monthly_cost_cents, setupFeeCents: 0 };
    case "hostinger":
      return { provider: "hostinger", planRef: settings.hostinger_item_id, regionRef: settings.hostinger_data_center_id ? String(settings.hostinger_data_center_id) : null,
        imageRef: settings.hostinger_template_id ? String(settings.hostinger_template_id) : null,
        monthlyCostCents: settings.hostinger_monthly_cost_cents, setupFeeCents: settings.hostinger_setup_fee_cents };
    case "contabo":
      return { provider: "contabo", planRef: settings.contabo_product_id, regionRef: settings.contabo_region, imageRef: settings.contabo_image_id,
        monthlyCostCents: settings.contabo_monthly_cost_cents, setupFeeCents: settings.contabo_setup_fee_cents };
  }
}

/** Which providers have credentials in this deployment (never the credentials themselves). */
export function configuredProviders(ctx: AppContext): Record<VpsProviderKind, boolean> {
  const c = ctx.config.computers ?? {};
  return {
    hetzner: Boolean(ctx.vps?.hetzner ?? c.hetznerApiToken),
    hostinger: Boolean(ctx.vps?.hostinger ?? c.hostingerApiToken),
    contabo: Boolean(ctx.vps?.contabo ?? c.contabo),
  };
}

/** The provider client, from the environment's credentials; null when this deployment has none for it. */
export function providerFor(ctx: AppContext, kind: VpsProviderKind): VpsProvider | null {
  const fake = ctx.vps?.[kind];
  if (fake) return fake;
  const c = ctx.config.computers ?? {};
  switch (kind) {
    case "hetzner":
      return c.hetznerApiToken ? new HetznerProvider(c.hetznerApiToken, ctx.fetch) : null;
    case "hostinger":
      return c.hostingerApiToken ? new HostingerProvider(c.hostingerApiToken, ctx.fetch) : null;
    case "contabo":
      return c.contabo ? new ContaboProvider(c.contabo, ctx.fetch) : null;
  }
}

/** How long a bought machine may stay without its agent before it is marked failed. Contabo can take many hours. */
export const PROVISION_TIMEOUT_MS: Record<VpsProviderKind, number> = {
  hetzner: 2 * 60 * 60_000,
  hostinger: 3 * 60 * 60_000,
  contabo: 72 * 60 * 60_000,
};

/** How often a machine being bought is checked. */
export const PROVISION_POLL_MS: Record<VpsProviderKind, number> = {
  hetzner: 60_000,
  hostinger: 2 * 60_000,
  contabo: 10 * 60_000,
};

export const ENROLL_TTL_MS = 24 * 60 * 60_000;
