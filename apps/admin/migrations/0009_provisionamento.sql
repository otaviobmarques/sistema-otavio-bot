-- Provisionamento automático: cada assinatura ativa (ou teste grátis) ganha a própria instância do ArkoBot
-- (imagem cloud-home) num servidor (nó) compartilhado. Um agente em cada nó busca no Admin o que deve rodar
-- (modelo pull: o nó não abre porta) e acerta o Docker. Só acrescenta colunas e índices; pode rodar de novo.

-- Nós -------------------------------------------------------------------------

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_version text;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_error text CHECK (last_error IS NULL OR length(last_error) <= 2000);
-- Contêineres com as etiquetas do ArkoBot que o Admin não pediu (o agente nunca mexe neles sozinho).
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS orphan_containers integer NOT NULL DEFAULT 0 CHECK (orphan_containers >= 0);
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS token_rotated_at timestamptz;

-- Instâncias ------------------------------------------------------------------

-- O token do gateway de IA da instância, cifrado (AES-256-GCM, ADMIN_ENCRYPTION_KEY): o agente precisa dele a cada
-- vez que recria o contêiner. gateway_tokens continua guardando só o hash.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS gateway_token_id uuid REFERENCES gateway_tokens (id) ON DELETE RESTRICT;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS gateway_token_enc text;
-- Sobe a cada "Reprovisionar": muda a revisão e o agente recria o contêiner (puxando a imagem de novo). Os dados ficam no volume.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 1 CHECK (generation > 0);
-- Parada pelo operador: fica parada mesmo que a cobrança reative o cliente, até o operador ligar de novo.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS operator_stopped boolean NOT NULL DEFAULT false;
-- Desativada de vez: o agente remove o contêiner. O volume com os dados nunca é apagado sozinho.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS decommissioned_at timestamptz;
-- O que o agente viu da última vez.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS observed_state text
  CHECK (observed_state IN ('running', 'starting', 'stopped', 'absent', 'error'));
ALTER TABLE instances ADD COLUMN IF NOT EXISTS observed_health text CHECK (observed_health IN ('healthy', 'unhealthy', 'starting', 'none'));
ALTER TABLE instances ADD COLUMN IF NOT EXISTS observed_error text CHECK (observed_error IS NULL OR length(observed_error) <= 2000);
ALTER TABLE instances ADD COLUMN IF NOT EXISTS observed_revision text;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS observed_at timestamptz;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS container_id text CHECK (container_id IS NULL OR container_id ~ '^[0-9a-f]{12,64}$');
ALTER TABLE instances ADD COLUMN IF NOT EXISTS ready_at timestamptz;
-- O plano que a instância já conhece (POST /api/cloud/plan assinado): limite de bots e limites do plano Inicial.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS plan_tier_synced text;

-- Uma instância viva por organização (o modo "home"; equipes com várias instâncias vêm depois).
CREATE UNIQUE INDEX IF NOT EXISTS instances_one_live_per_org ON instances (organization_id) WHERE decommissioned_at IS NULL;
CREATE INDEX IF NOT EXISTS instances_unassigned_idx ON instances (created_at) WHERE node_id IS NULL AND decommissioned_at IS NULL;
CREATE INDEX IF NOT EXISTS instances_gateway_token_idx ON instances (gateway_token_id);
