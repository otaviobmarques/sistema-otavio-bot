import type { VpsProvider, VpsProviderKind } from "./computers/provider.ts";
import type { AdminConfig } from "./config.ts";
import type { Db } from "./db/db.ts";
import type { Mailer } from "./mail/mailer.ts";
import type { SecretBox } from "./security/crypto.ts";

export interface AppContext {
  config: AdminConfig;
  db: Db;
  box: SecretBox;
  mailer: Mailer;
  /** Injected so tests can move the clock. */
  now: () => Date;
  /** Every outbound HTTP call (Asaas, provider key tests) goes through this. */
  fetch: typeof fetch;
  /** Tests only: fake VPS providers. Otherwise each is built from its credentials in the environment (computers/settings.ts). */
  vps?: Partial<Record<VpsProviderKind, VpsProvider>>;
}
