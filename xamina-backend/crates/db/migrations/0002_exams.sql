-- QUESTIONS (bank soal)
CREATE TABLE questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL, -- multiple_choice|essay|true_false
  content     TEXT NOT NULL,
  options     JSONB,         -- [{id,text,is_correct}]
  answer_key  TEXT,          -- untuk essay: rubrik
  score       INT DEFAULT 1,
  difficulty  TEXT DEFAULT 'medium',
  topic       TEXT,
  bloom_level TEXT,          -- C1-C6
  ai_generated BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- EXAM_QUESTIONS (relasi exam ↔ question)
CREATE TABLE exam_questions (
  exam_id     UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id),
  order_num   INT NOT NULL,
  PRIMARY KEY(exam_id, question_id)
);

-- SUBMISSIONS (sesi ujian siswa)
CREATE TABLE submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  exam_id      UUID NOT NULL REFERENCES exams(id),
  student_id   UUID NOT NULL REFERENCES users(id),
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  score        NUMERIC(5,2),
  status       TEXT DEFAULT 'ongoing',
  answers      JSONB DEFAULT '{}',  -- {q_id: a_id}
  flagged      JSONB DEFAULT '[]',  -- [q_id]
  ip_address   INET,
  user_agent   TEXT,
  UNIQUE(exam_id, student_id)
);

-- INDEX untuk performa
CREATE INDEX ON exams(tenant_id, created_by);
CREATE INDEX ON submissions(exam_id, student_id);
CREATE INDEX ON questions(tenant_id, topic);
CREATE INDEX ON submissions(tenant_id, finished_at);
