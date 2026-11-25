import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppContext } from "../../context.ts";
import { DomainError } from "../../domain/lifecycle.ts";
import { AI_PROVIDERS, checkAiKey, checkHostingerToken, type AiProvider } from "../../integrations/checks.ts";
import { fingerprint } from "../../security/crypto.ts";
import { actorOf, body, param, router } from "../http.ts";

const secret = z.string().trim().min(12, "chave curta demais").max(1000);
const aiKeyContext = (id: string) => `ai_provider_keys.api_key:${id}`;
const hostingerContext = (id: string) => `vps_provider_accounts.api_token:${id}`;

const AI_COLUMNS = `id, provider, label, base_url, api_key_fingerprint, enabled, priority, last_tested_at, last_test_ok, last_test_message, rotated_at, created_at`;
const VPS_COLUMNS = `id, provider, label, api_token_fingerprint, enabled, last_tested_at, last_test_ok, last_test_message, created_at`;

export function integrationRoutes(ctx: AppContext) {
  const app = router();

  app.get("/", async (c) => {
    const [ai, vps, billing] = await Promise.all([
      ctx.db.query(`SELECT ${AI_COLUMNS} FROM ai_provider_keys ORDER BY provider, priority, created_at`),
      ctx.db.query(`SELECT ${VPS_COLUMNS} FROM vps_provider_accounts ORDER BY created_at`),
      ctx.db.query("SELECT id, label, environment, active_for_new, enabled, last_test_ok, api_key_fingerprint FROM billing_accounts ORDER BY created_at"),
    ]);
    return c.json({ aiKeys: ai.rows, vpsAccounts: vps.rows, billingAccounts: billing.rows });
  });

  app.post("/ai-keys", async (c) => {
    const input = await body(c, z.object({
      provider: z.enum(AI_PROVIDERS), label: z.string().trim().min(2).max(80), apiKey: secret,
      baseUrl: z.url().startsWith("https://").nullable().optional(), priority: z.number().int().min(0).max(1000).default(100),
    }));
    const row = await ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO ai_provider_keys (provider, label, base_url, api_key_enc, api_key_fingerprint, priority) VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id`,
        [input.provider, input.label, input.baseUrl ?? null, fingerprint(input.apiKey), input.priority]);
      const id = rows[0]!.id;
      await q.query("UPDATE ai_provider_keys SET api_key_enc = $2 WHERE id = $1", [id, ctx.box.encrypt(input.apiKey, aiKeyContext(id))]);
      await audit(q, actorOf(c), { action: "ai_key.created", targetType: "ai_provider_key", targetId: id,
        data: { provider: input.provider, label: input.label, fingerprint: fingerprint(input.apiKey) } });
      return (await q.query(`SELECT ${AI_COLUMNS} FROM ai_provider_keys WHERE id = $1`, [id])).rows[0];
    });
    return c.json({ aiKey: row }, 201);
  });

  app.put("/ai-keys/:id", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({
      label: z.string().trim().min(2).max(80), enabled: z.boolean(), priority: z.number().int().min(0).max(1000), apiKey: secret.optional(),
    }));
    await ctx.db.tx(async (q) => {
      const { rowCount } = await q.query("UPDATE ai_provider_keys SET label = $2, enabled = $3, priority = $4 WHERE id = $1", [id, input.label, input.enabled, input.priority]);
      if (!rowCount) throw new DomainError("Chave não encontrada", 404);
      if (input.apiKey) {
        await q.query("UPDATE ai_provider_keys SET api_key_enc = $2, api_key_fingerprint = $3, rotated_at = now(), last_test_ok = NULL WHERE id = $1",
          [id, ctx.box.encrypt(input.apiKey, aiKeyContext(id)), fingerprint(input.apiKey)]);
      }
      await audit(q, actorOf(c), { action: input.apiKey ? "ai_key.rotated" : "ai_key.updated", targetType: "ai_provider_key", targetId: id,
        data: { label: input.label, enabled: input.enabled, priority: input.priority } });
    });
    return c.json({ ok: true });
  });

  app.delete("/ai-keys/:id", async (c) => {
    const id = param(c, "id");
    await ctx.db.tx(async (q) => {
      const used = await q.query("SELECT 1 FROM usage_events WHERE ai_provider_key_id = $1 LIMIT 1", [id]);
      if (used.rows.length) throw new DomainError("Chave já usada pelo gateway: desative-a em vez de excluir", 409);
      const { rowCount } = await q.query("DELETE FROM ai_provider_keys WHERE id = $1", [id]);
      if (!rowCount) throw new DomainError("Chave não encontrada", 404);
      await audit(q, actorOf(c), { action: "ai_key.deleted", targetType: "ai_provider_key", targetId: id });
    });
    return c.json({ ok: true });
  });

  app.post("/ai-keys/:id/test", async (c) => {
    const id = param(c, "id");
    const row = (await ctx.db.query<{ provider: AiProvider; base_url: string | null; api_key_enc: string }>(
      "SELECT provider, base_url, api_key_enc FROM ai_provider_keys WHERE id = $1", [id])).rows[0];
    if (!row) throw new DomainError("Chave não encontrada", 404);
    const result = await checkAiKey(ctx.fetch, row.provider, ctx.box.decrypt(row.api_key_enc, aiKeyContext(id)), row.base_url);
    await ctx.db.query("UPDATE ai_provider_keys SET last_tested_at = $2, last_test_ok = $3, last_test_message = $4 WHERE id = $1",
      [id, ctx.now(), result.ok, result.message]);
    return c.json(result);
  });

  app.post("/vps-accounts", async (c) => {
    const input = await body(c, z.object({ label: z.string().trim().min(2).max(80), apiToken: secret }));
    const row = await ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ id: string }>(
        "INSERT INTO vps_provider_accounts (provider, label, api_token_enc, api_token_fingerprint) VALUES ('hostinger', $1, 'pending', $2) RETURNING id",
        [input.label, fingerprint(input.apiToken)]);
      const id = rows[0]!.id;
      await q.query("UPDATE vps_provider_accounts SET api_token_enc = $2 WHERE id = $1", [id, ctx.box.encrypt(input.apiToken, hostingerContext(id))]);
      await audit(q, actorOf(c), { action: "vps_account.created", targetType: "vps_provider_account", targetId: id, data: { label: input.label } });
      return (await q.query(`SELECT ${VPS_COLUMNS} FROM vps_provider_accounts WHERE id = $1`, [id])).rows[0];
    });
    return c.json({ vpsAccount: row }, 201);
  });

  app.put("/vps-accounts/:id", async (c) => {
    const id = param(c, "id");
    const input = await body(c, z.object({ label: z.string().trim().min(2).max(80), enabled: z.boolean(), apiToken: secret.optional() }));
    await ctx.db.tx(async (q) => {
      const { rowCount } = await q.query("UPDATE vps_provider_accounts SET label = $2, enabled = $3 WHERE id = $1", [id, input.label, input.enabled]);
      if (!rowCount) throw new DomainError("Conta não encontrada", 404);
      if (input.apiToken) {
        await q.query("UPDATE vps_provider_accounts SET api_token_enc = $2, api_token_fingerprint = $3, last_test_ok = NULL WHERE id = $1",
          [id, ctx.box.encrypt(input.apiToken, hostingerContext(id)), fingerprint(input.apiToken)]);
      }
      await audit(q, actorOf(c), { action: input.apiToken ? "vps_account.rotated" : "vps_account.updated", targetType: "vps_provider_account", targetId: id });
    });
    return c.json({ ok: true });
  });

  app.post("/vps-accounts/:id/test", async (c) => {
    const id = param(c, "id");
    const row = (await ctx.db.query<{ api_token_enc: string }>("SELECT api_token_enc FROM vps_provider_accounts WHERE id = $1", [id])).rows[0];
    if (!row) throw new DomainError("Conta não encontrada", 404);
    const result = await checkHostingerToken(ctx.fetch, ctx.box.decrypt(row.api_token_enc, hostingerContext(id)));
    await ctx.db.query("UPDATE vps_provider_accounts SET last_tested_at = $2, last_test_ok = $3, last_test_message = $4 WHERE id = $1",
      [id, ctx.now(), result.ok, result.message]);
    return c.json(result);
  });

  return app;
}
