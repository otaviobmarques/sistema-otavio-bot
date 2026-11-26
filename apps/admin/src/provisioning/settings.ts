import type { AdminConfig } from "../config.ts";

/**
 * The Cloud home target of the ArkoBot image (Dockerfile, `--target cloud-home`; published by docker.yml as
 * `<repo>-cloud-home`). The plain server image (`sistema-otavio-bot:latest`) runs the self-hosted server with no
 * Cloud home contract, so it cannot be provisioned per customer.
 */
export const DEFAULT_INSTANCE_IMAGE = "ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home:latest";
export const DEFAULT_BASE_DOMAIN = "arkobot.com.br";
export const DEFAULT_GATEWAY_URL = "https://ia.arkobot.com.br";
/** How often the agent asks for the desired state. */
export const AGENT_POLL_SECONDS = 15;
/** A node not heard from for this long shows as offline in the panel. */
export const NODE_STALE_MS = 3 * 60_000;

export interface ProvisioningSettings {
  baseDomain: string;
  image: string;
  gatewayUrl: string;
  /** OMB_CLOUD_ADMIN_URL: the origin the instance names as its Admin (the customer area). */
  adminOrigin: string;
}

export function provisioningSettings(config: AdminConfig): ProvisioningSettings {
  const p = config.provisioning ?? {};
  return {
    baseDomain: (p.baseDomain ?? DEFAULT_BASE_DOMAIN).replace(/^\.+|\.+$/g, "").toLowerCase(),
    image: p.image ?? DEFAULT_INSTANCE_IMAGE,
    gatewayUrl: (p.gatewayUrl ?? DEFAULT_GATEWAY_URL).replace(/\/+$/, ""),
    adminOrigin: new URL(config.customerPublicUrl).origin,
  };
}

/** Sub-domains of the base domain that are ours (or plausibly will be) and never a customer's. */
export const RESERVED_SLUGS = new Set([
  "admin", "conta", "ia", "www", "api", "app", "apps", "mail", "email", "smtp", "imap", "pop", "ftp", "webmail", "docs", "status",
  "painel", "suporte", "ajuda", "blog", "cdn", "static", "assets", "img", "ns1", "ns2", "dns", "vpn", "traefik", "gateway", "portal",
  "site", "login", "auth", "cloud", "dev", "staging", "teste", "test", "demo", "arkobot", "domma", "relay", "connector", "companion",
]);

/** A DNS label for the instance: the organisation's slug, kept clear of reserved names. */
export function baseSlug(orgSlug: string): string {
  let slug = orgSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  if (slug.length < 2) slug = `bot-${slug || "x"}`;
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-bot`;
  return slug;
}

export function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base.slice(0, 50)}-${attempt + 1}`;
}

export interface PlanResources {
  memoryMb: number;
  cpus: number;
  pids: number;
}

/**
 * Container limits from the plan's ram_mb. One CPU per 2 GB, between half a CPU and four. The Cloud home supervisor
 * gates engine starts on the cgroup's memory (server/box-memory.ts), so the plan's memory is the instance's budget.
 */
export function planResources(ramMb: number | null | undefined): PlanResources {
  const memoryMb = Math.max(768, Math.min(Number(ramMb) || 1024, 65_536));
  const cpus = Math.max(0.5, Math.min(4, Math.round((memoryMb / 2048) * 2) / 2));
  return { memoryMb, cpus, pids: memoryMb <= 1024 ? 512 : 2048 };
}
