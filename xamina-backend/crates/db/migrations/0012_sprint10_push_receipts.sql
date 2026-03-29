ALTER TABLE push_jobs
  ADD COLUMN IF NOT EXISTS receipt_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS receipt_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_clicked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_jobs_receipt_token
  ON push_jobs(receipt_token);

CREATE TABLE IF NOT EXISTS push_delivery_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_job_id UUID NOT NULL REFERENCES push_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('received', 'clicked')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(push_job_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_receipts_tenant_user
  ON push_delivery_receipts(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_receipts_push_job
  ON push_delivery_receipts(push_job_id, created_at DESC);

ALTER TABLE push_delivery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_delivery_receipts_tenant_isolation ON push_delivery_receipts;
CREATE POLICY push_delivery_receipts_tenant_isolation ON push_delivery_receipts
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());
