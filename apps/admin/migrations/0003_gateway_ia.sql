-- Gateway de IA: tabela de preços, configurações, reservas de crédito e avisos de consumo.

-- O consumo de IA pode deixar o saldo avulso um pouco negativo (tolerância configurável), nunca o do plano.
ALTER TABLE credit_wallets DROP CONSTRAINT credit_wallets_extra_balance_check;
ALTER TABLE credit_ledger DROP CONSTRAINT credit_ledger_balance_after_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_balance_after_check CHECK (balance_after >= 0 OR bucket = 'extra');

CREATE TABLE gateway_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  markup_percent numeric(7, 2) NOT NULL DEFAULT 30 CHECK (markup_percent >= 0 AND markup_percent <= 1000),
  usd_brl_rate numeric(8, 4) NOT NULL DEFAULT 5.5 CHECK (usd_brl_rate > 0),
  overdraft_credits integer NOT NULL DEFAULT 20 CHECK (overdraft_credits >= 0),
  rate_limit_per_minute integer NOT NULL DEFAULT 120 CHECK (rate_limit_per_minute > 0),
  reservation_minutes integer NOT NULL DEFAULT 30 CHECK (reservation_minutes BETWEEN 1 AND 240),
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gateway_settings DEFAULT VALUES;

-- Preços de lista em US$ por milhão de tokens. markup_percent nulo usa o markup geral.
CREATE TABLE model_prices (
  model text PRIMARY KEY CHECK (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter')),
  label text NOT NULL DEFAULT '',
  input_usd numeric(12, 6) NOT NULL CHECK (input_usd >= 0),
  cached_input_usd numeric(12, 6) NOT NULL CHECK (cached_input_usd >= 0),
  cache_write_usd numeric(12, 6) NOT NULL CHECK (cache_write_usd >= 0),
  output_usd numeric(12, 6) NOT NULL CHECK (output_usd >= 0),
  markup_percent numeric(7, 2) CHECK (markup_percent >= 0 AND markup_percent <= 1000),
  default_max_output integer NOT NULL DEFAULT 8192 CHECK (default_max_output > 0),
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO model_prices (model, provider, label, input_usd, cached_input_usd, cache_write_usd, output_usd, source) VALUES
  ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5', 1, 0.1, 1.25, 5, 'anthropic 2026-09-23'),
  ('claude-sonnet-4-5', 'anthropic', 'Claude Sonnet 4.5', 3, 0.3, 3.75, 15, 'anthropic'),
  ('claude-opus-4-5', 'anthropic', 'Claude Opus 4.5', 5, 0.5, 6.25, 25, 'anthropic'),
  ('claude-haiku-5-5', 'anthropic', 'Claude Haiku 5.5', 0.1, 0.01, 0.125, 0.5, 'anthropic 2026-10-27'),
  ('claude-sonnet-5', 'anthropic', 'Claude Sonnet 5', 2, 0.2, 2.5, 10, 'anthropic 2026-09-23'),
  ('claude-opus-5', 'anthropic', 'Claude Opus 5', 5, 0.5, 6.25, 25, 'anthropic 2026-09-23'),
  ('claude-fable-5', 'anthropic', 'Claude Fable 5', 10, 1, 12.5, 50, 'anthropic 2026-09-23'),
  ('gpt-5-mini', 'openai', 'GPT-5 mini', 0.25, 0.025, 0.25, 2, 'openai'),
  ('gpt-5', 'openai', 'GPT-5', 1.25, 0.125, 1.25, 10, 'openai'),
  ('gpt-5.4-mini', 'openai', 'GPT-5.4 mini', 0.75, 0.075, 0.75, 4.5, 'openai 2026-09-23'),
  ('gpt-5.4', 'openai', 'GPT-5.4', 2.5, 0.25, 2.5, 15, 'openai 2026-09-23'),
  ('gpt-5.5', 'openai', 'GPT-5.5', 5, 0.5, 5, 30, 'openai 2026-09-23'),
  ('gpt-5.3-codex', 'openai', 'GPT-5.3 Codex', 1.75, 0.175, 1.75, 14, 'openai 2026-09-23'),
  ('google/gemini-2.5-flash', 'openrouter', 'Gemini 2.5 Flash', 0.3, 0.03, 0.3, 2.5, 'openrouter 2026-09-23'),
  ('google/gemini-2.5-pro', 'openrouter', 'Gemini 2.5 Pro', 1.25, 0.125, 1.25, 10, 'openrouter 2026-09-23'),
  ('google/gemini-3.1-pro-preview', 'openrouter', 'Gemini 3.1 Pro (preview)', 2, 0.2, 2, 12, 'openrouter 2026-09-23'),
  ('x-ai/grok-4.7', 'openrouter', 'Grok 4.7', 1.6, 0.4, 1.6, 4.8, 'openrouter 2026-09-23'),
  ('minimax/minimax-m3', 'openrouter', 'MiniMax M3', 0.3, 0.06, 0.3, 1.2, 'openrouter 2026-09-23')
ON CONFLICT (model) DO NOTHING;

-- Os planos iniciais citavam o Gemini pelo nome curto; pelo gateway ele passa pelo OpenRouter.
UPDATE plans SET allowed_models = array_replace(array_replace(allowed_models, 'gemini-2.5-flash', 'google/gemini-2.5-flash'), 'gemini-2.5-pro', 'google/gemini-2.5-pro')
WHERE code IN ('essencial', 'profissional', 'empresa');

-- Créditos separados para uma requisição em andamento. O saldo disponível é a carteira menos as reservas ativas.
CREATE TABLE credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  gateway_token_id uuid REFERENCES gateway_tokens (id) ON DELETE RESTRICT,
  request_id text NOT NULL UNIQUE,
  credits bigint NOT NULL CHECK (credits > 0),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'settled', 'released', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  finished_at timestamptz
);
CREATE INDEX credit_reservations_held_idx ON credit_reservations (organization_id) WHERE status = 'held';
CREATE INDEX credit_reservations_expiry_idx ON credit_reservations (expires_at) WHERE status = 'held';

ALTER TABLE usage_events
  ADD COLUMN endpoint text NOT NULL DEFAULT '',
  ADD COLUMN company text,
  ADD COLUMN bot text,
  ADD COLUMN reserved_credits bigint NOT NULL DEFAULT 0,
  ADD COLUMN cost_brl_cents numeric(16, 4) NOT NULL DEFAULT 0,
  ADD COLUMN usd_brl_rate numeric(8, 4),
  ADD COLUMN markup_percent numeric(7, 2),
  ADD COLUMN usage_estimated boolean NOT NULL DEFAULT false,
  ADD COLUMN http_status integer,
  ADD COLUMN error_code text,
  ADD COLUMN duration_ms integer;
CREATE INDEX usage_events_created_idx ON usage_events (created_at DESC);
CREATE INDEX usage_events_model_idx ON usage_events (model, created_at DESC);

-- Avisos de consumo da cota do período (50, 80 e 100%), uma vez por período.
CREATE TABLE usage_alerts (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  threshold integer NOT NULL CHECK (threshold IN (50, 80, 100)),
  used_credits bigint NOT NULL,
  quota_credits bigint NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_start, threshold)
);

CREATE TRIGGER gateway_settings_touch BEFORE UPDATE ON gateway_settings FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER model_prices_touch BEFORE UPDATE ON model_prices FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();

ALTER TABLE gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_alerts ENABLE ROW LEVEL SECURITY;
