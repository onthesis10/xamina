-- Question Bank Refactor: Add media support, status workflow, tags, and AI metadata
-- Sprint 17: Question Bank v2

-- Add JSONB array for multimedia attachments (image, audio, video)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;

-- Add workflow status: draft, review, published, archived
ALTER TABLE questions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

-- AI generation metadata (model, prompt, confidence, etc.)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT NULL;

-- Tags for smart categorization
ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_questions_tags ON questions USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(tenant_id, topic);
