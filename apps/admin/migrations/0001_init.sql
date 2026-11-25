-- Central de Administrador do ArkoBot: esquema inicial.
-- Postgres padrão (14+). Nenhuma extensão é necessária: gen_random_uuid() é nativo desde o 13.

CREATE FUNCTION arko_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é somente inserção (imutável)', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END
$$;

CREATE FUNCTION arko_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Operadores da Domma -------------------------------------------------------

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+$'),
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('owner', 'operator', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  totp_secret_enc text,
  totp_enabled_at timestamptz,
  totp_last_step bigint,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (totp_enabled_at IS NULL OR totp_secret_enc IS NOT NULL)
);

CREATE TABLE admin_otps (
  admin_id uuid PRIMARY KEY REFERENCES admins (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  mfa_pending boolean NOT NULL DEFAULT false,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_updated_idx ON rate_limits (updated_at);

-- Clientes ------------------------------------------------------------------

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+$'),
  name text NOT NULL DEFAULT '',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  document_type text NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
  document text NOT NULL UNIQUE,
  billing_email text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled')),
  status_reason text,
  status_reason_code text CHECK (status_reason_code IN ('manual', 'billing', 'chargeback', 'subscription_ended')),
  status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((document_type = 'cpf' AND document ~ '^[0-9]{11}$') OR (document_type = 'cnpj' AND document ~ '^[0-9]{14}$')),
  CHECK (status = 'active' OR status_reason IS NOT NULL)
);
CREATE INDEX organizations_status_idx ON organizations (status);

CREATE TABLE memberships (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, account_id)
);
CREATE INDEX memberships_account_idx ON memberships (account_id);
CREATE UNIQUE INDEX memberships_one_owner ON memberships (organization_id) WHERE role = 'owner';

CREATE TABLE terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations (id) ON DELETE RESTRICT,
  document text NOT NULL CHECK (document IN ('terms', 'privacy', 'dpa')),
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 40),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text NOT NULL,
  user_agent text
);
CREATE INDEX terms_acceptances_account_idx ON terms_acceptances (account_id, document, accepted_at DESC);
CREATE INDEX terms_acceptances_org_idx ON terms_acceptances (organization_id);

-- Planos --------------------------------------------------------------------

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  credits_per_month bigint NOT NULL CHECK (credits_per_month >= 0),
  max_bots integer CHECK (max_bots >= 0),
  max_companies integer CHECK (max_companies >= 0),
  ram_mb integer NOT NULL CHECK (ram_mb >= 0),
  disk_gb integer NOT NULL CHECK (disk_gb >= 0),
  included_vps integer NOT NULL DEFAULT 0 CHECK (included_vps >= 0),
  allowed_models text[] NOT NULL DEFAULT '{}',
  default_model text,
  free boolean NOT NULL DEFAULT false,
  cloud_mode text NOT NULL DEFAULT 'dedicated' CHECK (cloud_mode IN ('dedicated', 'shared_limited', 'none')),
  browser_enabled boolean NOT NULL DEFAULT true,
  computer_enabled boolean NOT NULL DEFAULT true,
  -- O cliente pode usar a própria conta ou chave de IA além dos créditos; esse uso não passa pelo gateway nem debita créditos.
  allow_byo_ai boolean NOT NULL DEFAULT true,
  idle_sleep_minutes integer CHECK (idle_sleep_minutes > 0),
  inactive_delete_days integer CHECK (inactive_delete_days > 0),
  daily_credit_cap bigint CHECK (daily_credit_cap > 0),
  monthly_credit_cap bigint CHECK (monthly_credit_cap > 0),
  per_request_credit_cap bigint CHECK (per_request_credit_cap > 0),
  active boolean NOT NULL DEFAULT true,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT free OR price_cents = 0),
  CHECK (free OR price_cents > 0),
  CHECK (default_model IS NULL OR cardinality(allowed_models) = 0 OR default_model = ANY (allowed_models))
);

-- Cobrança ------------------------------------------------------------------

CREATE TABLE billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'asaas' CHECK (provider IN ('asaas')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  holder_type text NOT NULL CHECK (holder_type IN ('pf', 'pj')),
  holder_name text NOT NULL,
  holder_document text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  api_key_enc text NOT NULL,
  api_key_fingerprint text NOT NULL,
  webhook_token_enc text NOT NULL,
  can_issue_nfse boolean NOT NULL DEFAULT false,
  active_for_new boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((holder_type = 'pf' AND holder_document ~ '^[0-9]{11}$') OR (holder_type = 'pj' AND holder_document ~ '^[0-9]{14}$')),
  CHECK (NOT active_for_new OR enabled)
);
CREATE UNIQUE INDEX billing_accounts_one_active_for_new ON billing_accounts ((true)) WHERE active_for_new;

CREATE TABLE billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  billing_account_id uuid NOT NULL REFERENCES billing_accounts (id) ON DELETE RESTRICT,
  provider_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, billing_account_id),
  UNIQUE (billing_account_id, provider_customer_id)
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  billing_account_id uuid REFERENCES billing_accounts (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'suspended', 'canceled')),
  billing_type text CHECK (billing_type IN ('PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED')),
  provider_subscription_id text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  credits_per_month bigint NOT NULL CHECK (credits_per_month >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_due_date date,
  past_due_since timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_account_id, provider_subscription_id),
  CHECK (price_cents = 0 OR billing_account_id IS NOT NULL),
  CHECK (status <> 'past_due' OR past_due_since IS NOT NULL)
);
CREATE UNIQUE INDEX subscriptions_one_current ON subscriptions (organization_id) WHERE status <> 'canceled';
CREATE INDEX subscriptions_plan_idx ON subscriptions (plan_id);
CREATE INDEX subscriptions_status_idx ON subscriptions (status);

-- Itens adicionais cobrados junto da assinatura (ex.: computador individual por bot).
CREATE TABLE addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK (price_cents > 0),
  unit text NOT NULL CHECK (unit IN ('per_bot', 'per_subscription')),
  paid_plans_only boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions (id) ON DELETE RESTRICT,
  addon_id uuid NOT NULL REFERENCES addons (id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, addon_id)
);
CREATE INDEX subscription_addons_addon_idx ON subscription_addons (addon_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES subscriptions (id) ON DELETE RESTRICT,
  billing_account_id uuid NOT NULL REFERENCES billing_accounts (id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('subscription', 'credit_purchase')),
  provider_payment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'received', 'overdue', 'refunded', 'chargeback', 'canceled')),
  billing_type text,
  value_cents integer NOT NULL CHECK (value_cents >= 0),
  credits bigint NOT NULL DEFAULT 0 CHECK (credits >= 0),
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  pix_payload text,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_account_id, provider_payment_id)
);
CREATE INDEX payments_org_idx ON payments (organization_id, created_at DESC);
CREATE INDEX payments_subscription_idx ON payments (subscription_id);
CREATE INDEX payments_status_idx ON payments (status);

CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts (id) ON DELETE RESTRICT,
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  UNIQUE (billing_account_id, event_id)
);
CREATE INDEX billing_events_status_idx ON billing_events (status, received_at);

-- Créditos ArkoBot (1 crédito = R$ 0,01) -----------------------------------

CREATE TABLE credit_wallets (
  organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE RESTRICT,
  plan_balance bigint NOT NULL DEFAULT 0 CHECK (plan_balance >= 0),
  extra_balance bigint NOT NULL DEFAULT 0 CHECK (extra_balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  billing_account_id uuid REFERENCES billing_accounts (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments (id) ON DELETE RESTRICT,
  admin_id uuid REFERENCES admins (id) ON DELETE RESTRICT,
  bucket text NOT NULL CHECK (bucket IN ('plan', 'extra')),
  kind text NOT NULL CHECK (kind IN ('plan_grant', 'plan_expire', 'purchase', 'admin_adjust', 'refund_reversal', 'chargeback_reversal', 'usage')),
  amount bigint NOT NULL CHECK (amount <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  external_reference text NOT NULL UNIQUE,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_org_idx ON credit_ledger (organization_id, created_at DESC);
CREATE INDEX credit_ledger_payment_idx ON credit_ledger (payment_id);
CREATE INDEX credit_ledger_kind_idx ON credit_ledger (kind, created_at);
CREATE TRIGGER credit_ledger_immutable BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION arko_forbid_mutation();
CREATE TRIGGER credit_ledger_no_truncate BEFORE TRUNCATE ON credit_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION arko_forbid_mutation();

-- Infraestrutura (preenchida nas próximas partes) --------------------------

CREATE TABLE vps_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('hostinger')),
  label text NOT NULL,
  api_token_enc text NOT NULL,
  api_token_fingerprint text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vps_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('hostinger')),
  provider_account_id uuid REFERENCES vps_provider_accounts (id) ON DELETE RESTRICT,
  provider_vm_id text,
  organization_id uuid REFERENCES organizations (id) ON DELETE RESTRICT,
  hostname text,
  plan_code text,
  region text,
  ipv4 text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'provisioning', 'running', 'stopped', 'failed', 'deleted')),
  monthly_cost_cents integer CHECK (monthly_cost_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_vm_id)
);
CREATE INDEX vps_machines_org_idx ON vps_machines (organization_id);

CREATE TABLE nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('dedicated', 'shared_free')),
  vps_machine_id uuid REFERENCES vps_machines (id) ON DELETE RESTRICT,
  region text,
  public_ip text,
  capacity_ram_mb integer CHECK (capacity_ram_mb > 0),
  capacity_instances integer CHECK (capacity_instances > 0),
  agent_token_hash text UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draining', 'offline')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES subscriptions (id) ON DELETE RESTRICT,
  node_id uuid REFERENCES nodes (id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  machine_id text NOT NULL UNIQUE CHECK (machine_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'),
  role text NOT NULL DEFAULT 'home' CHECK (role IN ('home', 'team')),
  mode text NOT NULL CHECK (mode IN ('dedicated', 'shared_limited', 'desktop')),
  bootstrap_secret_enc text,
  state text NOT NULL DEFAULT 'setting_up' CHECK (state IN ('setting_up', 'ready', 'stopped', 'payment_problem', 'failed')),
  state_reason text,
  public_url text,
  sleeping boolean NOT NULL DEFAULT false,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instances_org_idx ON instances (organization_id);
CREATE INDEX instances_node_idx ON instances (node_id);
CREATE INDEX instances_subscription_idx ON instances (subscription_id);

-- Gateway de IA (próxima parte) ---------------------------------------------

CREATE TABLE ai_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter', 'google', 'groq', 'other')),
  label text NOT NULL,
  base_url text,
  api_key_enc text NOT NULL,
  api_key_fingerprint text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gateway_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  instance_id uuid REFERENCES instances (id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  label text NOT NULL DEFAULT '',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gateway_tokens_org_idx ON gateway_tokens (organization_id);
CREATE INDEX gateway_tokens_instance_idx ON gateway_tokens (instance_id);

CREATE TABLE usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  instance_id uuid REFERENCES instances (id) ON DELETE RESTRICT,
  gateway_token_id uuid REFERENCES gateway_tokens (id) ON DELETE RESTRICT,
  ai_provider_key_id uuid REFERENCES ai_provider_keys (id) ON DELETE RESTRICT,
  request_id text NOT NULL UNIQUE,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd_micros bigint NOT NULL DEFAULT 0,
  credits bigint NOT NULL CHECK (credits >= 0),
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'refused')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_org_idx ON usage_events (organization_id, created_at DESC);
CREATE INDEX usage_events_instance_idx ON usage_events (instance_id);
CREATE INDEX usage_events_token_idx ON usage_events (gateway_token_id);
CREATE INDEX usage_events_key_idx ON usage_events (ai_provider_key_id);

-- Auditoria e fila ----------------------------------------------------------

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'system', 'webhook', 'cli')),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  target_type text,
  target_id text,
  organization_id uuid REFERENCES organizations (id) ON DELETE RESTRICT,
  reason text,
  data jsonb NOT NULL DEFAULT '{}',
  ip text
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_org_idx ON audit_log (organization_id, created_at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action);
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION arko_forbid_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION arko_forbid_mutation();

CREATE TABLE jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  last_error text,
  locked_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX jobs_ready_idx ON jobs (run_at) WHERE status = 'queued';
CREATE INDEX jobs_running_idx ON jobs (locked_at) WHERE status = 'running';
CREATE UNIQUE INDEX jobs_dedupe_idx ON jobs (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

-- updated_at automático ----------------------------------------------------

CREATE TRIGGER admins_touch BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER accounts_touch BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER plans_touch BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER billing_accounts_touch BEFORE UPDATE ON billing_accounts FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER addons_touch BEFORE UPDATE ON addons FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER subscription_addons_touch BEFORE UPDATE ON subscription_addons FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER payments_touch BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER vps_provider_accounts_touch BEFORE UPDATE ON vps_provider_accounts FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER vps_machines_touch BEFORE UPDATE ON vps_machines FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER nodes_touch BEFORE UPDATE ON nodes FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER instances_touch BEFORE UPDATE ON instances FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();
CREATE TRIGGER ai_provider_keys_touch BEFORE UPDATE ON ai_provider_keys FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();

-- Supabase expõe o esquema public pela API REST (PostgREST). Com RLS ligado e
-- nenhuma política, os papéis anon/authenticated não leem nem escrevem nada;
-- o Admin conecta como dono das tabelas, que não é afetado.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admins', 'admin_otps', 'admin_sessions', 'rate_limits', 'accounts', 'organizations', 'memberships',
    'terms_acceptances', 'plans', 'billing_accounts', 'billing_customers', 'subscriptions', 'addons', 'subscription_addons', 'payments',
    'billing_events', 'credit_wallets', 'credit_ledger', 'vps_provider_accounts', 'vps_machines', 'nodes',
    'instances', 'ai_provider_keys', 'gateway_tokens', 'usage_events', 'audit_log', 'jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
