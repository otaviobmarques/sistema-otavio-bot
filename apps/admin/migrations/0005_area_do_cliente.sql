-- Área do cliente (conta.arkobot.com.br): login por código no e-mail, sessões e pedidos de exclusão de conta.

-- Código de acesso por e-mail. A chave é o e-mail (normalizado) porque quem se cadastra ainda não tem conta:
-- a conta só nasce quando o código confere. Um novo código substitui o anterior.
CREATE TABLE account_otps (
  email text PRIMARY KEY CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+$'),
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_otps_expires_idx ON account_otps (expires_at);

-- Sessões do cliente. O banco guarda só o hash (SHA-256) do token do cookie.
CREATE TABLE account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX account_sessions_account_idx ON account_sessions (account_id);
CREATE INDEX account_sessions_expires_idx ON account_sessions (expires_at);

-- Pedido de exclusão feito pelo próprio cliente (LGPD, art. 18). É um aviso para o operador:
-- nada é apagado sozinho, e pagamentos, notas e o extrato de créditos ficam guardados pelo prazo legal.
CREATE TABLE account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations (id) ON DELETE RESTRICT,
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed', 'rejected')),
  ip text NOT NULL,
  user_agent text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES admins (id) ON DELETE RESTRICT,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'requested') = (resolved_at IS NULL))
);
CREATE UNIQUE INDEX account_deletion_requests_one_open ON account_deletion_requests (account_id) WHERE status = 'requested';
CREATE INDEX account_deletion_requests_org_idx ON account_deletion_requests (organization_id);
CREATE INDEX account_deletion_requests_status_idx ON account_deletion_requests (status, created_at);
CREATE TRIGGER account_deletion_requests_touch BEFORE UPDATE ON account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();

-- O próprio cliente passa a aparecer como autor na auditoria (cadastro, assinatura, cancelamento, exportação…).
ALTER TABLE audit_log DROP CONSTRAINT audit_log_actor_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_type_check
  CHECK (actor_type IN ('admin', 'system', 'webhook', 'cli', 'customer'));

-- Mesmo padrão da 0001: RLS ligado e nenhuma política (a API REST do Supabase não lê nada).
ALTER TABLE account_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
