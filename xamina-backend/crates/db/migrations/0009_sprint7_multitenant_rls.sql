CREATE SCHEMA IF NOT EXISTS app;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS users_quota INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS ai_credits_quota INT NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS ai_credits_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'guru', 'siswa', 'super_admin'));

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.role', true), '')
$$;

CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'super_admin'
$$;

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classes_tenant_isolation ON classes;
CREATE POLICY classes_tenant_isolation ON classes
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS refresh_tokens_tenant_isolation ON refresh_tokens;
CREATE POLICY refresh_tokens_tenant_isolation ON refresh_tokens
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS questions_tenant_isolation ON questions;
CREATE POLICY questions_tenant_isolation ON questions
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS exams_tenant_isolation ON exams;
CREATE POLICY exams_tenant_isolation ON exams
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS submissions_tenant_isolation ON submissions;
CREATE POLICY submissions_tenant_isolation ON submissions
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_questions_tenant_isolation ON exam_questions;
CREATE POLICY exam_questions_tenant_isolation ON exam_questions
  USING (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM exams e
      WHERE e.id = exam_questions.exam_id
        AND e.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM exams e
      WHERE e.id = exam_questions.exam_id
        AND e.tenant_id = app.current_tenant_id()
    )
  );

ALTER TABLE submission_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submission_answers_tenant_isolation ON submission_answers;
CREATE POLICY submission_answers_tenant_isolation ON submission_answers
  USING (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM submissions s
      WHERE s.id = submission_answers.submission_id
        AND s.tenant_id = app.current_tenant_id()
    )
  );

ALTER TABLE submission_anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submission_anomalies_tenant_isolation ON submission_anomalies;
CREATE POLICY submission_anomalies_tenant_isolation ON submission_anomalies
  USING (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM submissions s
      WHERE s.id = submission_anomalies.submission_id
        AND s.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM submissions s
      WHERE s.id = submission_anomalies.submission_id
        AND s.tenant_id = app.current_tenant_id()
    )
  );
