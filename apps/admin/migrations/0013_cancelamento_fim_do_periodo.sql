-- Cancelamento pelo cliente no fim do período já pago: a assinatura no Asaas é encerrada na hora (sem novas cobranças),
-- mas a assinatura aqui continua ativa e o ArkoBot funcionando até cancel_at; o tick do cron encerra a assinatura
-- nessa hora (instância parada, dados mantidos). Nulo: nenhum cancelamento agendado.
-- Só acrescenta; pode rodar de novo.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at timestamptz;
CREATE INDEX IF NOT EXISTS subscriptions_cancel_at_idx ON subscriptions (cancel_at) WHERE cancel_at IS NOT NULL AND status <> 'canceled';
