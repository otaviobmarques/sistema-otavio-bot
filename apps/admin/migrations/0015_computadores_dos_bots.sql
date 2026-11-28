-- Computadores extras ligados aos bots (src/computers/assign.ts): uma VPS "computador" do cliente vira um computador
-- "VPS própria" do ArkoBot dele. O agente da VPS manda as chaves de host do SSH (nada é confiado no primeiro acesso), o
-- ArkoBot do cliente gera a própria chave (a privada nunca sai dele) e o Admin entrega o computador por requisição
-- assinada. Só acrescenta; pode rodar de novo.

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS ssh_host_keys text[];
ALTER TABLE instances ADD COLUMN IF NOT EXISTS computer_public_key text;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS assigned_instance_id uuid REFERENCES instances (id) ON DELETE SET NULL;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE vps_machines ADD COLUMN IF NOT EXISTS assign_error text;
