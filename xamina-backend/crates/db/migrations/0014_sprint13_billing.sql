CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('starter', 'professional', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('pending_activation', 'active', 'past_due', 'cancelled')),
  provider TEXT NOT NULL,
  provider_ref TEXT,
  amount BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  latest_invoice_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscriptions_tenant_active
  ON billing_subscriptions (tenant_id)
  WHERE status IN ('pending_activation', 'active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_tenant_created
  ON billing_subscriptions (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('starter', 'professional', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'overdue', 'cancelled')),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  checkout_url TEXT,
  pdf_path TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  raw_payload_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_ref)
);

ALTER TABLE billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_latest_invoice_fk;

ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_latest_invoice_fk
  FOREIGN KEY (latest_invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant_created
  ON billing_invoices (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_due_retry
  ON billing_invoices (status, due_at, next_retry_at);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  provider_ref TEXT,
  raw_payload_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_ref
  ON billing_webhook_events (provider_ref);

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_subscriptions_tenant_isolation ON billing_subscriptions;
CREATE POLICY billing_subscriptions_tenant_isolation ON billing_subscriptions
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS billing_invoices_tenant_isolation ON billing_invoices;
CREATE POLICY billing_invoices_tenant_isolation ON billing_invoices
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS billing_webhook_events_tenant_isolation ON billing_webhook_events;
CREATE POLICY billing_webhook_events_tenant_isolation ON billing_webhook_events
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());
