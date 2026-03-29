CREATE TABLE IF NOT EXISTS platform_ai_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  preferred_provider TEXT NOT NULL DEFAULT 'auto' CHECK (preferred_provider IN ('auto', 'openai', 'groq')),
  openai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  groq_model TEXT NOT NULL DEFAULT 'llama-3.1-8b-instant',
  ai_mock_mode BOOLEAN NOT NULL DEFAULT FALSE,
  generate_rate_limit_per_min INT NOT NULL DEFAULT 12 CHECK (generate_rate_limit_per_min > 0),
  grade_rate_limit_per_min INT NOT NULL DEFAULT 30 CHECK (grade_rate_limit_per_min > 0),
  extract_rate_limit_per_min INT NOT NULL DEFAULT 10 CHECK (extract_rate_limit_per_min > 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_ai_settings (
  id,
  preferred_provider,
  openai_model,
  groq_model,
  ai_mock_mode,
  generate_rate_limit_per_min,
  grade_rate_limit_per_min,
  extract_rate_limit_per_min
)
VALUES (TRUE, 'auto', 'gpt-4o-mini', 'llama-3.1-8b-instant', FALSE, 12, 30, 10)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created_at
  ON platform_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action
  ON platform_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_tenant
  ON platform_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor
  ON platform_audit_logs (actor_user_id, created_at DESC);

ALTER TABLE platform_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_ai_settings_super_admin_only ON platform_ai_settings;
CREATE POLICY platform_ai_settings_super_admin_only ON platform_ai_settings
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

DROP POLICY IF EXISTS platform_audit_logs_super_admin_only ON platform_audit_logs;
CREATE POLICY platform_audit_logs_super_admin_only ON platform_audit_logs
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());
