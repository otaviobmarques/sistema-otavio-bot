export const SITE_URL = "https://arkobot.com.br";
export const SUPPORT_EMAIL = "contato@arkobot.com.br";
export const SUPPORT_WHATSAPP_URL = "https://wa.me/5519987822290";
/** ArkoBot has no help pages yet, so Help opens support on WhatsApp. */
export const HELP_CENTER_URL = SUPPORT_WHATSAPP_URL;
export const FEEDBACK_URL = SUPPORT_WHATSAPP_URL;
export const RELEASES_URL = "https://github.com/otaviobmarques/otavio-bot-releases/releases";
export const PRICING_URL = `${SITE_URL}/#planos`;
export const CLOUD_PLAN_URL = "https://conta.arkobot.com.br";
export function withSource(url: string, source: string): string {
  const target = new URL(url);
  target.searchParams.set("src", source);
  return target.href;
}
/** Apache-2.0 attribution: the license of the project ArkoBot is built on. */
export const LICENSE_URL = "https://github.com/milind-soni/OpenMausBot/blob/main/LICENSE";

export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

export function platformLabel(platform?: string): string | null {
  return (platform && PLATFORM_NAMES[platform]) ?? null;
}

export async function openExternalLink(url: string): Promise<void> {
  if (window.ogb?.openExternal) {
    await window.ogb.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** A browser hands a mailto: link to its own mail app; the desktop app's window may not navigate to one, so main opens it. */
export async function openEmailDraft(url: string): Promise<void> {
  if (window.ogb) return openExternalLink(url);
  window.location.href = url;
}
