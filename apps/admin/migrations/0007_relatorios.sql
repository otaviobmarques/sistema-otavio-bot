-- Relatórios de problema (@devs) que o app ArkoBot envia para POST /webhooks/bug-reports. Qualquer um na internet pode
-- enviar: nada aqui é confiável, o tamanho é limitado na API e de novo aqui, e o operador só lê.

CREATE TABLE bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  install_id text NOT NULL CHECK (length(install_id) BETWEEN 1 AND 64),
  app_version text NOT NULL CHECK (length(app_version) BETWEEN 1 AND 40),
  platform text NOT NULL CHECK (length(platform) BETWEEN 1 AND 40),
  contact text CHECK (contact IS NULL OR length(contact) <= 254),
  ip text,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 1048576),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'closed')),
  status_changed_at timestamptz,
  status_changed_by uuid REFERENCES admins (id) ON DELETE RESTRICT
);
CREATE INDEX bug_reports_received_idx ON bug_reports (received_at DESC);
CREATE INDEX bug_reports_status_idx ON bug_reports (status, received_at DESC);
CREATE INDEX bug_reports_install_idx ON bug_reports (install_id);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
