CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'finished', 'auto_finished')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ NOT NULL,
  question_order_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC(5,2),
  correct_count INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS submission_answers (
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_jsonb JSONB NOT NULL DEFAULT 'null'::jsonb,
  is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS submission_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_tenant_student ON submissions(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_tenant_exam ON submissions(tenant_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status_deadline ON submissions(status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_submission_anomalies_submission ON submission_anomalies(submission_id, created_at DESC);
