-- Plano Inicial (R$ 39, 7 dias grátis, IA gratuita já inclusa), teste grátis genérico por plano e IA gratuita pelo gateway.
-- Só acrescenta: pode rodar de novo sem mudar nada (IF NOT EXISTS, ON CONFLICT DO NOTHING, UPDATE com a mesma condição).

-- Teste grátis --------------------------------------------------------------

ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 90);
-- Requisições por dia (dia de Brasília) aos modelos gratuitos do gateway; 0 = o plano não usa a IA gratuita.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS free_requests_per_day integer NOT NULL DEFAULT 0 CHECK (free_requests_per_day BETWEEN 0 AND 1000000);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Um teste grátis por organização e por CPF/CNPJ, para sempre: a linha fica mesmo se a assinatura for cancelada
-- ou o documento da organização for corrigido depois.
CREATE TABLE IF NOT EXISTS subscription_trials (
  document text PRIMARY KEY CHECK (document ~ '^([0-9]{11}|[0-9]{14})$'),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL UNIQUE REFERENCES subscriptions (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > started_at)
);
ALTER TABLE subscription_trials ENABLE ROW LEVEL SECURITY;

-- IA gratuita: provedores compatíveis com a API da OpenAI com plano gratuito ---------------------

ALTER TABLE model_prices DROP CONSTRAINT IF EXISTS model_prices_provider_check;
ALTER TABLE model_prices ADD CONSTRAINT model_prices_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'openrouter', 'google', 'nvidia', 'groq', 'cerebras'));

ALTER TABLE ai_provider_keys DROP CONSTRAINT IF EXISTS ai_provider_keys_provider_check;
ALTER TABLE ai_provider_keys ADD CONSTRAINT ai_provider_keys_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'openrouter', 'google', 'nvidia', 'groq', 'cerebras', 'other'));

-- free: custa 0 crédito e não reserva nada; conta no limite diário free_requests_per_day do plano.
-- upstream_model: o id enviado ao provedor quando difere do id no ArkoBot (NULL = o próprio id).
ALTER TABLE model_prices ADD COLUMN IF NOT EXISTS free boolean NOT NULL DEFAULT false;
ALTER TABLE model_prices ADD COLUMN IF NOT EXISTS upstream_model text CHECK (upstream_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$');
ALTER TABLE model_prices DROP CONSTRAINT IF EXISTS model_prices_free_costs_nothing;
ALTER TABLE model_prices ADD CONSTRAINT model_prices_free_costs_nothing
  CHECK (NOT free OR (input_usd = 0 AND cached_input_usd = 0 AND cache_write_usd = 0 AND output_usd = 0));
-- No OpenRouter, só os modelos com o sufixo :free não são cobrados da conta.
ALTER TABLE model_prices DROP CONSTRAINT IF EXISTS model_prices_free_openrouter_suffix;
ALTER TABLE model_prices ADD CONSTRAINT model_prices_free_openrouter_suffix
  CHECK (NOT free OR provider <> 'openrouter' OR COALESCE(upstream_model, model) LIKE '%:free');

-- Modelos conferidos com chamadas reais em 2026-11-26 (o de Cerebras só listado: ainda sem chave). Editáveis em Preços,
-- e o modelo de cada provedor também pode vir de ARKOBOT_FREE_MODEL_<PROVEDOR> no gateway. Sem chave do provedor
-- (Integrações ou variável de ambiente do gateway), o modelo é pulado.
INSERT INTO model_prices (model, provider, label, input_usd, cached_input_usd, cache_write_usd, output_usd, free, upstream_model, default_max_output, source) VALUES
  ('gratis/gpt-oss-120b', 'groq', 'GPT OSS 120B (grátis, Groq)', 0, 0, 0, 0, true, 'openai/gpt-oss-120b', 4096, 'groq, plano gratuito 2026-11-26'),
  ('gratis/gemini-3.8-flash', 'google', 'Gemini 3.8 Flash (grátis)', 0, 0, 0, 0, true, 'gemini-3.8-flash', 4096, 'google ai studio, plano gratuito 2026-11-26'),
  ('gratis/kimi-k3.1-pro', 'nvidia', 'Kimi K3.1 Pro (grátis, NVIDIA)', 0, 0, 0, 0, true, 'moonshotai/kimi-k3.1-pro', 4096, 'catálogo de API da NVIDIA 2026-11-26'),
  ('gratis/nemotron-3.5-super-vl', 'openrouter', 'Nemotron 3.5 Super VL (grátis, OpenRouter)', 0, 0, 0, 0, true, 'nvidia/nemotron-3.5-super-vl:free', 4096, 'openrouter :free 2026-11-26'),
  ('gratis/gemma-4-31b', 'openrouter', 'Gemma 4 31B (grátis, OpenRouter)', 0, 0, 0, 0, true, 'google/gemma-4-31b-it:free', 4096, 'openrouter :free 2026-11-26'),
  ('gratis/gpt-oss-120b-cerebras', 'cerebras', 'GPT OSS 120B (grátis, Cerebras)', 0, 0, 0, 0, true, 'gpt-oss-120b', 4096, 'cerebras, listado em 2026-11-26')
ON CONFLICT (model) DO NOTHING;

-- Qual provedor e qual id de modelo atenderam de fato (a IA gratuita troca de provedor quando um está no limite).
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS upstream_model text;

-- A escada de planos -----------------------------------------------------------

INSERT INTO plans (
  code, name, description, price_cents, billing_cycle, credits_per_month, max_bots, max_companies, ram_mb, disk_gb,
  included_vps, allowed_models, default_model, free, cloud_mode, browser_enabled, computer_enabled, idle_sleep_minutes,
  daily_credit_cap, monthly_credit_cap, per_request_credit_cap, trial_days, free_requests_per_day, active, visible, sort_order
) VALUES
  ('inicial', 'Inicial', 'Assistente pessoal 24 h com IA gratuita já inclusa.', 3900, 'monthly', 0, 1, 1, 1024, 5,
   0, ARRAY['gratis/gpt-oss-120b', 'gratis/gemini-3.8-flash', 'gratis/kimi-k3.1-pro', 'gratis/nemotron-3.5-super-vl', 'gratis/gemma-4-31b', 'gratis/gpt-oss-120b-cerebras'],
   'gratis/gpt-oss-120b', false, 'shared_limited', true, false, 30,
   NULL, NULL, 20, 7, 200, true, true, 5)
ON CONFLICT (code) DO NOTHING;

UPDATE plans SET computer_enabled = false WHERE code = 'essencial' AND computer_enabled;

-- O diferencial de cada degrau vira a descrição, só onde ninguém mudou o texto da 0002.
UPDATE plans SET description = 'Bots que trabalham sozinhos: rotinas agendadas e aprovações pelo WhatsApp, com créditos de IA inclusos.'
  WHERE code = 'essencial' AND description = 'Para começar: até 3 bots na sua instância.';
UPDATE plans SET description = 'Computador próprio na nuvem: seus bots usam sistemas, planilhas e notas fiscais.'
  WHERE code = 'profissional' AND description = 'Até 10 bots, 3 empresas e 1 computador (VPS) incluído.';
UPDATE plans SET description = 'Gestão de várias empresas: um andar por empresa, com regras e orçamento de IA próprios.'
  WHERE code = 'empresa' AND description = 'Bots e empresas sem limite, 2 computadores (VPS) incluídos.';
