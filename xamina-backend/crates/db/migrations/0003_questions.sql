CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'true_false', 'short_answer')),
  content TEXT NOT NULL,
  options_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer_key JSONB NOT NULL DEFAULT 'null'::jsonb,
  topic TEXT,
  difficulty TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_tenant_type ON questions(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_questions_tenant_topic ON questions(tenant_id, topic);
CREATE INDEX IF NOT EXISTS idx_questions_tenant_difficulty ON questions(tenant_id, difficulty);
