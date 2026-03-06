CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certificate_no TEXT NOT NULL UNIQUE,
  score NUMERIC(5,2) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'retry', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS push_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'retry', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_tenant_student
  ON certificates(tenant_id, student_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_submission
  ON certificates(submission_id);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status_next_attempt
  ON email_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_tenant_user
  ON email_jobs(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_jobs_status_next_attempt
  ON push_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_push_jobs_tenant_user
  ON push_jobs(tenant_id, user_id, created_at DESC);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certificates_tenant_isolation ON certificates;
CREATE POLICY certificates_tenant_isolation ON certificates
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS email_jobs_tenant_isolation ON email_jobs;
CREATE POLICY email_jobs_tenant_isolation ON email_jobs
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS push_subscriptions_tenant_isolation ON push_subscriptions;
CREATE POLICY push_subscriptions_tenant_isolation ON push_subscriptions
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS push_jobs_tenant_isolation ON push_jobs;
CREATE POLICY push_jobs_tenant_isolation ON push_jobs
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());
