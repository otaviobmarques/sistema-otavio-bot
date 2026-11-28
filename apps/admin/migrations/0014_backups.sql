-- Backups dos dados dos clientes (src/backups): uma cópia diária do volume de cada instância num armazenamento externo
-- compatível com S3, feita pelo agente do nó (ele congela o contêiner alguns segundos, empacota o volume e envia direto
-- ao armazenamento). Também servem para mudar uma instância de servidor: backup no nó de origem, restauração no de
-- destino. Só acrescenta; pode rodar de novo.

CREATE TABLE IF NOT EXISTS instance_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES instances (id) ON DELETE RESTRICT,
  node_id uuid NOT NULL REFERENCES nodes (id) ON DELETE RESTRICT,
  -- scheduled: a diária; manual: pedida pelo operador; move: a cópia de uma mudança de servidor.
  kind text NOT NULL CHECK (kind IN ('scheduled', 'manual', 'move')),
  -- pending: o agente ainda vai empacotar; uploading: enviando; done; failed; deleted: apagada pela retenção.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'done', 'failed', 'deleted')),
  object_key text NOT NULL UNIQUE,
  upload_id text,
  bytes bigint CHECK (bytes >= 0),
  sha256 text,
  error text,
  requested_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS instance_backups_instance_idx ON instance_backups (instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS instance_backups_open_idx ON instance_backups (node_id) WHERE status IN ('pending', 'uploading');
-- No máximo um backup em andamento por instância.
CREATE UNIQUE INDEX IF NOT EXISTS instance_backups_one_open ON instance_backups (instance_id) WHERE status IN ('pending', 'uploading');

-- Restaurar um backup num nó: o agente baixa e desempacota no volume antes de o contêiner existir ali.
CREATE TABLE IF NOT EXISTS instance_restores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES instances (id) ON DELETE RESTRICT,
  node_id uuid NOT NULL REFERENCES nodes (id) ON DELETE RESTRICT,
  backup_id uuid NOT NULL REFERENCES instance_backups (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS instance_restores_one_open ON instance_restores (instance_id) WHERE status = 'pending';

-- Mudança de servidor em andamento: o nó de destino. Enquanto não é nula, a instância fica parada (o backup "move"
-- roda na origem, depois a restauração no destino) e só então node_id passa a ser o destino.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS relocating_to_node_id uuid REFERENCES nodes (id) ON DELETE SET NULL;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS relocation_started_at timestamptz;
