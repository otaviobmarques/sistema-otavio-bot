-- Computadores próprios (VPS): cada unidade do plano (Profissional 1, Empresa 2) ou do adicional "Computador próprio
-- (VPS)" vira uma VPS comprada pelo Admin num provedor (Hetzner Cloud por padrão; Hostinger ou Contabo), com o agente do nó instalado
-- pelo script de primeira inicialização. A primeira unidade de cada cliente recebe o ArkoBot dele (nó dedicado, instância
-- no modo 'dedicated'); o tráfego continua entrando pelo Traefik da VPS compartilhada (o DNS curinga aponta para ela) e
-- segue cifrado, sem ser aberto, até a VPS do cliente.
-- Compra automática desligada por padrão: cada pedido espera "Aprovar e contratar" no painel.
-- Só acrescenta tabelas, colunas e índices; pode rodar de novo.

-- Configurações (uma linha) ------------------------------------------------------

CREATE TABLE IF NOT EXISTS vps_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Desligada: cada VPS a comprar vira um pedido pendente que o operador aprova no painel.
  auto_purchase boolean NOT NULL DEFAULT false,
  -- Onde as próximas VPS são compradas. As já compradas ficam no provedor em que nasceram (vps_machines.provider).
  provider text NOT NULL DEFAULT 'hetzner' CHECK (provider IN ('hetzner', 'hostinger', 'contabo')),
  -- Hetzner Cloud: cobrança por hora (com teto mensal); apagar a VPS para a cobrança na hora e apaga o disco.
  -- cx23 (2 vCPU, 4 GB, 40 GB) só existe nas localizações da Europa (fsn1, nbg1, hel1); em ash/hil use cpx21.
  hetzner_server_type text NOT NULL DEFAULT 'cx23' CHECK (hetzner_server_type ~ '^[a-z0-9-]{2,40}$'),
  hetzner_location text NOT NULL DEFAULT 'fsn1' CHECK (hetzner_location ~ '^[a-z0-9-]{2,20}$'),
  hetzner_image text CHECK (hetzner_image ~ '^[a-z0-9.-]{2,60}$'),
  -- Em reais, com o IPv4: confira no console da Hetzner (o preço é em euro) e ajuste no painel.
  hetzner_monthly_cost_cents integer NOT NULL DEFAULT 2600 CHECK (hetzner_monthly_cost_cents >= 0),
  -- Hostinger: item do catálogo (GET /api/billing/v1/catalog). KVM 1: 1 vCPU, 4 GB, 50 GB, R$ 87,99/mês.
  hostinger_item_id text NOT NULL DEFAULT 'hostingercombr-vps-kvm1-brl-1m' CHECK (hostinger_item_id ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  -- Nulos: o Admin escolhe (modelo "Ubuntu 24.04 with Docker"; data center no Brasil, se houver).
  hostinger_template_id integer CHECK (hostinger_template_id > 0),
  hostinger_data_center_id integer CHECK (hostinger_data_center_id > 0),
  hostinger_monthly_cost_cents integer NOT NULL DEFAULT 8799 CHECK (hostinger_monthly_cost_cents >= 0),
  hostinger_setup_fee_cents integer NOT NULL DEFAULT 0 CHECK (hostinger_setup_fee_cents >= 0),
  -- Contabo: produto, região e imagem (nula: a Ubuntu 24.04 padrão). Preço e taxa de instalação não vêm pela API.
  contabo_product_id text NOT NULL DEFAULT 'V91' CHECK (contabo_product_id ~ '^[A-Za-z0-9-]{1,40}$'),
  contabo_region text NOT NULL DEFAULT 'US-east' CHECK (contabo_region ~ '^[A-Za-z0-9-]{2,40}$'),
  contabo_image_id text CHECK (contabo_image_id ~ '^[A-Za-z0-9-]{8,64}$'),
  contabo_monthly_cost_cents integer NOT NULL DEFAULT 0 CHECK (contabo_monthly_cost_cents >= 0),
  contabo_setup_fee_cents integer NOT NULL DEFAULT 0 CHECK (contabo_setup_fee_cents >= 0),
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO vps_settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING;
ALTER TABLE vps_settings ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS vps_settings_touch ON vps_settings;
CREATE TRIGGER vps_settings_touch BEFORE UPDATE ON vps_settings FOR EACH ROW EXECUTE FUNCTION arko_touch_updated_at();

-- Máquinas ---------------------------------------------------------------------

ALTER TABLE vps_machines DROP CONSTRAINT IF EXISTS vps_machines_provider_check;
ALTER TABLE vps_machines ADD CONSTRAINT vps_machines_provider_check CHECK (provider IN ('hetzner', 'hostinger', 'contabo'));
ALTER TABLE vps_provider_accounts DROP CONSTRAINT IF EXISTS vps_provider_accounts_provider_check;
ALTER TABLE vps_provider_accounts ADD CONSTRAINT vps_provider_accounts_provider_check CHECK (provider IN ('hetzner', 'hostinger', 'contabo'));

ALTER TABLE vps_machines DROP CONSTRAINT IF EXISTS vps_machines_status_check;
ALTER TABLE vps_machines ADD CONSTRAINT vps_machines_status_check CHECK (status IN (
  'awaiting_approval', -- pedido pendente: compra automática desligada, ou unidade extra
  'requested',         -- aprovado: a tarefa vai comprar
  'ordering',          -- compra enviada ao provedor; nunca é repetida sozinha
  'provisioning',      -- VPS comprada: instalando e esperando o agente (na Contabo pode levar horas)
  'running',           -- agente do nó no ar
  'release_pending',   -- o cliente deixou de ter direito: espera o operador encerrar a renovação
  'released',          -- renovação desligada no provedor; a VPS vale até expires_at
  'canceled',          -- pedido desfeito antes de comprar (nada foi gasto)
  'stopped', 'failed', 'deleted'
));

ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions (id) ON DELETE RESTRICT;
-- 'home': recebe a instância do ArkoBot do cliente; 'computer': unidade extra, para os computadores dos bots.
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'home' CHECK (purpose IN ('home', 'computer'));
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS status_reason text CHECK (status_reason IS NULL OR length(status_reason) <= 1000);
-- O que foi pedido ao provedor: item/produto, imagem/modelo (region já existe: data center ou região).
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS plan_ref text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS image_ref text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS setup_fee_cents integer CHECK (setup_fee_cents IS NULL OR setup_fee_cents >= 0);
-- O pedido e a assinatura no provedor (a renovação é desligada por ela).
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS provider_order_id text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS provider_subscription_id text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS provider_state text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS post_install_script_id text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS setup_requested_at timestamptz;
-- Token de inscrição de uso curto que o script de instalação troca pelo token do nó. Só o SHA-256 fica aqui.
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS enroll_token_hash text UNIQUE;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS enroll_expires_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES admins (id) ON DELETE SET NULL;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS ready_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS auto_renew boolean;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS released_at timestamptz;
-- Quando o cron olha de novo uma máquina sendo comprada ou instalada.
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS next_check_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS last_error text CHECK (last_error IS NULL OR length(last_error) <= 2000);

CREATE INDEX IF NOT EXISTS vps_machines_status_idx ON vps_machines (status);
CREATE INDEX IF NOT EXISTS vps_machines_subscription_idx ON vps_machines (subscription_id);
-- Um nó por máquina.
CREATE UNIQUE INDEX IF NOT EXISTS nodes_vps_machine_idx ON nodes (vps_machine_id) WHERE vps_machine_id IS NOT NULL;

-- Instâncias --------------------------------------------------------------------

-- Ao mudar de nó, o servidor antigo remove o contêiner (o volume fica) antes que esta coluna volte a nulo.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS previous_node_id uuid REFERENCES nodes (id) ON DELETE RESTRICT;
-- A VPS do cliente ficou pronta, mas a instância já tem dados no servidor compartilhado: espera o operador copiar o volume.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS move_to_node_id uuid REFERENCES nodes (id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS instances_previous_node_idx ON instances (previous_node_id) WHERE previous_node_id IS NOT NULL;

-- Adicional ---------------------------------------------------------------------

UPDATE addons SET name = 'Computador próprio (VPS)',
  description = 'Um computador (VPS) só seu, na nuvem, por R$ 159,00/mês cada. Disponível em todos os planos.'
WHERE code = 'computador-adicional' AND name = 'Computador individual (VPS) adicional';
