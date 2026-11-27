-- Três coisas, só acrescentando (pode rodar de novo):
-- 1. O plano Inicial dorme depois de 30 minutos sem uso (plans.idle_sleep_minutes) e acorda ao ser acessado.
-- 2. Avisos por e-mail quando um servidor (nó) para de responder e quando uma instância fica com erro.
-- 3. Os planos pagos passam a listar GPT e Gemini além do Claude (o gateway só mostra os que têm chave de provedor).

-- 1. Dormir -------------------------------------------------------------------

-- A coluna existe desde a 0001; o Inicial já nasceu com 30 na 0008. Garante o valor onde ninguém o mudou.
UPDATE plans SET idle_sleep_minutes = 30 WHERE code = 'inicial' AND idle_sleep_minutes IS NULL;

-- Desde quando a instância dorme (contêiner parado pelo agente, volume intacto). Nulo: acordada. Diferente de uma
-- parada por pagamento ou pelo operador: acorda sozinha quando alguém abre o ArkoBot ou visita o endereço dela.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS sleeping_since timestamptz;
-- Quando acordá-la sozinha: a próxima rotina dela menos 3 minutos (o que ela disse ao aceitar dormir). Nulo: só no acesso.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS wake_at timestamptz;
-- O último despertar (para a Área do cliente mostrar "Acordando…" até ela responder).
ALTER TABLE instances ADD COLUMN IF NOT EXISTS woke_at timestamptz;
-- A última leitura de GET /api/cloud/power e o que a mantinha acordada (códigos fixos, ex.: "turn,browser").
ALTER TABLE instances ADD COLUMN IF NOT EXISTS power_checked_at timestamptz;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS power_busy text CHECK (power_busy IS NULL OR length(power_busy) <= 200);
CREATE INDEX IF NOT EXISTS instances_sleeping_idx ON instances (wake_at) WHERE sleeping_since IS NOT NULL AND decommissioned_at IS NULL;

-- 2. Avisos -------------------------------------------------------------------

-- Quando o aviso "servidor sem contato" foi mandado; volta a nulo (com o aviso de volta) quando o agente responde de novo.
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS down_alerted_at timestamptz;
-- Desde quando o agente vê a instância com erro (ou o health check dela falhando), e quando o aviso foi mandado.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS unhealthy_since timestamptz;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS unhealthy_alerted_at timestamptz;

-- 3. Modelos dos planos pagos -------------------------------------------------

-- Só os ids da tabela de preços; os antigos claude-*-4-5 saem. O modelo padrão segue na lista (CHECK da 0001).
UPDATE plans SET
  allowed_models = ARRAY['claude-haiku-5-5', 'gpt-5.4-mini', 'google/gemini-2.5-flash'],
  default_model = 'claude-haiku-5-5'
WHERE code = 'essencial';

UPDATE plans SET
  allowed_models = ARRAY['claude-haiku-5-5', 'gpt-5.4-mini', 'google/gemini-2.5-flash',
    'claude-sonnet-5', 'gpt-5.4', 'google/gemini-3.1-pro-preview'],
  default_model = 'claude-sonnet-5'
WHERE code = 'profissional';

UPDATE plans SET
  allowed_models = ARRAY['claude-haiku-5-5', 'gpt-5.4-mini', 'google/gemini-2.5-flash',
    'claude-sonnet-5', 'gpt-5.4', 'google/gemini-3.1-pro-preview',
    'claude-opus-5', 'gpt-5.5', 'x-ai/grok-4.7'],
  default_model = 'claude-sonnet-5'
WHERE code = 'empresa';
