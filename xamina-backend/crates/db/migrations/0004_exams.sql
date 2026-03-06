CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  pass_score INT NOT NULL DEFAULT 70 CHECK (pass_score >= 0 AND pass_score <= 100),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_options BOOLEAN NOT NULL DEFAULT FALSE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_no INT NOT NULL CHECK (order_no > 0),
  PRIMARY KEY (exam_id, question_id),
  UNIQUE (exam_id, order_no)
);

CREATE INDEX IF NOT EXISTS idx_exams_tenant_status ON exams(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_exams_tenant_schedule ON exams(tenant_id, start_at, end_at);
