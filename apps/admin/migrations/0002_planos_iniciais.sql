-- Planos e adicionais iniciais definidos pelo dono. São só dados de partida:
-- tudo continua editável no painel (Planos). ON CONFLICT mantém o que já existir.
-- Não há plano gratuito na oferta inicial; o campo plans.free continua no modelo.

INSERT INTO plans (
  code, name, description, price_cents, billing_cycle, credits_per_month, max_bots, max_companies, ram_mb, disk_gb,
  included_vps, allowed_models, default_model, free, cloud_mode, browser_enabled, computer_enabled,
  daily_credit_cap, monthly_credit_cap, per_request_credit_cap, active, visible, sort_order
) VALUES
  ('essencial', 'Essencial', 'Para começar: até 3 bots na sua instância.', 15900, 'monthly', 4000, 3, 1, 2048, 20,
   0, ARRAY['claude-haiku-4-5', 'gpt-5-mini', 'gemini-2.5-flash'], 'claude-haiku-4-5', false, 'dedicated', true, true,
   400, NULL, 50, true, true, 10),
  ('profissional', 'Profissional', 'Até 10 bots, 3 empresas e 1 computador (VPS) incluído.', 59900, 'monthly', 20000, 10, 3, 4096, 50,
   1, ARRAY['claude-haiku-4-5', 'claude-sonnet-4-5', 'gpt-5-mini', 'gpt-5', 'gemini-2.5-flash', 'gemini-2.5-pro'], 'claude-sonnet-4-5', false, 'dedicated', true, true,
   2000, NULL, 200, true, true, 20),
  ('empresa', 'Empresa', 'Bots e empresas sem limite, 2 computadores (VPS) incluídos.', 99900, 'monthly', 40000, NULL, NULL, 8192, 100,
   2, ARRAY['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5', 'gpt-5-mini', 'gpt-5', 'gemini-2.5-flash', 'gemini-2.5-pro'], 'claude-sonnet-4-5', false, 'dedicated', true, true,
   5000, NULL, 500, true, true, 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO addons (code, name, description, price_cents, unit, paid_plans_only)
VALUES ('computador-adicional', 'Computador individual (VPS) adicional',
        'Um computador (VPS) só para um bot, cobrado por bot junto da assinatura.', 15900, 'per_bot', true)
ON CONFLICT (code) DO NOTHING;
