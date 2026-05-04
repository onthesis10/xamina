-- Migration 0020: Add tenant_id to student_profiles
-- This ensures student_profiles follows the same multi-tenancy pattern as other tables.

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Update existing profiles (if any) by joining users table
UPDATE student_profiles
SET tenant_id = users.tenant_id
FROM users
WHERE student_profiles.user_id = users.id
AND student_profiles.tenant_id IS NULL;

-- Make it NOT NULL after filling existing data
ALTER TABLE student_profiles ALTER COLUMN tenant_id SET NOT NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_student_profiles_tenant ON student_profiles(tenant_id);
