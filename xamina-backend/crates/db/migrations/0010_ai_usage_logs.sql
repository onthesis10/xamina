CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')),
  error_code TEXT,
  latency_ms INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_created_at
  ON ai_usage_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model_created_at
  ON ai_usage_logs(model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_status_created_at
  ON ai_usage_logs(status, created_at DESC);
