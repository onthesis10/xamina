CREATE INDEX IF NOT EXISTS idx_submissions_tenant_finished_at
  ON submissions(tenant_id, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_tenant_student_status
  ON submissions(tenant_id, student_id, status);

CREATE INDEX IF NOT EXISTS idx_exams_tenant_creator_status
  ON exams(tenant_id, created_by, status);

CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active
  ON users(tenant_id, role, is_active);
