-- Cortesia: assinatura liberada pelo operador sem cobrança. Não passa pelo Asaas, recebe a cota mensal do plano
-- pelo cron e termina sozinha em courtesy_until (NULL = sem prazo). Só acrescenta colunas: as linhas existentes
-- ficam com courtesy = false.

ALTER TABLE subscriptions
  ADD COLUMN courtesy boolean NOT NULL DEFAULT false,
  ADD COLUMN courtesy_reason text CHECK (courtesy_reason IS NULL OR length(trim(courtesy_reason)) BETWEEN 5 AND 500),
  ADD COLUMN courtesy_until date,
  ADD COLUMN courtesy_granted_by uuid REFERENCES admins (id) ON DELETE RESTRICT;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_courtesy_unbilled CHECK (
  NOT courtesy OR (price_cents = 0 AND billing_account_id IS NULL AND provider_subscription_id IS NULL AND courtesy_reason IS NOT NULL)
);
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_courtesy_fields_only_on_courtesy CHECK (
  courtesy OR (courtesy_reason IS NULL AND courtesy_until IS NULL AND courtesy_granted_by IS NULL)
);

CREATE INDEX subscriptions_courtesy_due_idx ON subscriptions (current_period_end) WHERE courtesy AND status = 'active';
