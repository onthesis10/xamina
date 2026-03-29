CREATE TABLE IF NOT EXISTS user_security_settings (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  challenge_token TEXT NOT NULL UNIQUE,
  otp_code_hash TEXT NOT NULL,
  delivery TEXT NOT NULL DEFAULT 'email' CHECK (delivery IN ('email')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  reason_codes_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  user_agent_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES auth_login_challenges(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('success', 'failed_password', 'challenge_required', 'challenge_verified', 'otp_failed')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  reason_codes_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_security_settings_tenant_user
  ON user_security_settings(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_user_created
  ON auth_login_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_token
  ON auth_login_challenges(challenge_token);
CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_active
  ON auth_login_challenges(user_id, consumed_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_login_events_user_created
  ON auth_login_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_events_email_created
  ON auth_login_events(tenant_id, email, created_at DESC);

ALTER TABLE user_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_security_settings_tenant_isolation ON user_security_settings;
CREATE POLICY user_security_settings_tenant_isolation ON user_security_settings
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS auth_login_challenges_tenant_isolation ON auth_login_challenges;
CREATE POLICY auth_login_challenges_tenant_isolation ON auth_login_challenges
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS auth_login_events_tenant_isolation ON auth_login_events;
CREATE POLICY auth_login_events_tenant_isolation ON auth_login_events
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());
