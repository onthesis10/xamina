CREATE INDEX IF NOT EXISTS idx_exams_published_creator_filter
  ON exams (tenant_id, created_by, start_at)
  WHERE status = 'published'
    AND start_at IS NOT NULL
    AND end_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exams_published_timerange_gist
  ON exams USING GIST (tstzrange(start_at, end_at, '[)'))
  WHERE status = 'published'
    AND start_at IS NOT NULL
    AND end_at IS NOT NULL;
