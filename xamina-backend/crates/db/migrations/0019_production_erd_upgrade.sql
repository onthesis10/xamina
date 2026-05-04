-- ============================================================================
-- Migration 0019: Production ERD Upgrade
-- Adds: subjects, student_profiles, teacher_assignments, student_class_history,
--        exam_participants, audit_logs
-- Alters: exams (+ subject_id, class_id), classes (+ grade_level)
-- ============================================================================

-- 1. SUBJECTS
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_subjects_tenant ON subjects(tenant_id);

-- 2. STUDENT PROFILES
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nisn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);

-- 3. TEACHER ASSIGNMENTS
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, teacher_id, subject_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(tenant_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_subject ON teacher_assignments(tenant_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class ON teacher_assignments(tenant_id, class_id);

-- 4. STUDENT CLASS HISTORY
CREATE TABLE IF NOT EXISTS student_class_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2025/2026',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, student_id, class_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_student_class_history_student ON student_class_history(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_class_history_active ON student_class_history(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_student_class_history_class ON student_class_history(tenant_id, class_id);

-- 5. ALTER EXAMS: add subject_id and class_id (nullable for backward compat)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(tenant_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(tenant_id, class_id);

-- 6. EXAM PARTICIPANTS (remedial / override)
CREATE TABLE IF NOT EXISTS exam_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_participants_exam ON exam_participants(tenant_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_participants_student ON exam_participants(tenant_id, student_id);

-- 7. AUDIT LOGS (tenant-level)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);

-- 8. ALTER CLASSES: add grade_level for structured grade
ALTER TABLE classes ADD COLUMN IF NOT EXISTS grade_level INT;

-- 9. DATA MIGRATION: copy existing users.class_id into student_class_history
INSERT INTO student_class_history (tenant_id, student_id, class_id, academic_year, is_active)
SELECT u.tenant_id, u.id, u.class_id, '2025/2026', TRUE
FROM users u
WHERE u.role = 'siswa' AND u.class_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================================
-- RLS Policies for new tables
-- ============================================================================

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subjects_tenant_isolation ON subjects;
CREATE POLICY subjects_tenant_isolation ON subjects
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_profiles_tenant_isolation ON student_profiles;
CREATE POLICY student_profiles_tenant_isolation ON student_profiles
  USING (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = student_profiles.user_id
        AND u.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = student_profiles.user_id
        AND u.tenant_id = app.current_tenant_id()
    )
  );

ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_assignments_tenant_isolation ON teacher_assignments;
CREATE POLICY teacher_assignments_tenant_isolation ON teacher_assignments
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

ALTER TABLE student_class_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_class_history_tenant_isolation ON student_class_history;
CREATE POLICY student_class_history_tenant_isolation ON student_class_history
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

ALTER TABLE exam_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_participants_tenant_isolation ON exam_participants;
CREATE POLICY exam_participants_tenant_isolation ON exam_participants
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());
