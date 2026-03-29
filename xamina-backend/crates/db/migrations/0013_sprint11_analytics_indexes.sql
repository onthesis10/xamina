CREATE INDEX IF NOT EXISTS idx_submissions_tenant_exam_status_finished_at
  ON submissions(tenant_id, exam_id, status, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_exam_student_status
  ON submissions(exam_id, student_id, status);

CREATE INDEX IF NOT EXISTS idx_submission_answers_submission_question
  ON submission_answers(submission_id, question_id);

CREATE INDEX IF NOT EXISTS idx_users_tenant_class
  ON users(tenant_id, class_id);
