-- Limite de espaço por cliente (medido, não imposto pelo disco): o volume Docker local não tem cota, e o disco da VPS é
-- compartilhado. O agente de cada nó mede o volume de dados de cada instância (no máximo a cada ~10 min) e manda no
-- relatório; o Admin compara com plans.disk_gb, avisa o cliente por e-mail (80% e 100%, uma vez cada) e diz à instância
-- o estado (POST /api/cloud/storage assinado), que recusa arquivos novos acima de 110%. Nada é apagado.
-- Só acrescenta colunas; pode rodar de novo.

-- Bytes usados no volume /data da instância, na última medição do agente, e quando foi.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS disk_used_bytes bigint CHECK (disk_used_bytes IS NULL OR disk_used_bytes >= 0);
ALTER TABLE instances ADD COLUMN IF NOT EXISTS disk_measured_at timestamptz;
-- O limite do plano na hora da medição (plans.disk_gb em bytes; nulo quando o plano não tem limite).
ALTER TABLE instances ADD COLUMN IF NOT EXISTS disk_quota_bytes bigint CHECK (disk_quota_bytes IS NULL OR disk_quota_bytes > 0);
-- ok < 80% ≤ warning < 100% ≤ full < 110% ≤ over. Nulo: ainda não medido, ou sem limite.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS disk_state text CHECK (disk_state IN ('ok', 'warning', 'full', 'over'));
-- O maior aviso já mandado por e-mail (0, 80 ou 100). Volta a 0 quando o uso cai abaixo de 70%, para não repetir.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS disk_notified_percent smallint NOT NULL DEFAULT 0 CHECK (disk_notified_percent IN (0, 80, 100));
-- O estado que a instância já conhece (POST /api/cloud/storage assinado).
ALTER TABLE instances ADD COLUMN IF NOT EXISTS disk_state_synced text;
