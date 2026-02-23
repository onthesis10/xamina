-- TENANTS (dikelola SuperAdmin)
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'starter',
  is_active   BOOLEAN DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- USERS (per tenant)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  email       TEXT NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL, -- superadmin|admin|guru|siswa
  class_id    UUID REFERENCES classes(id),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Enable RLS pada users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting(
    'app.tenant_id')::uuid);

-- EXAMS
CREATE TABLE exams (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  created_by         UUID NOT NULL REFERENCES users(id),
  title              TEXT NOT NULL,
  description        TEXT,
  duration_minutes   INT NOT NULL,
  pass_score         INT DEFAULT 70,
  status             TEXT DEFAULT 'draft',
  shuffle_questions  BOOLEAN DEFAULT false,
  start_at           TIMESTAMPTZ,
  end_at             TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
