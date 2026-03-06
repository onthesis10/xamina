-- Create app schema if not exists for RLS functions
CREATE SCHEMA IF NOT EXISTS app;

-- Seed super_admin user
-- Use a fixed UUID for the default super admin
-- Keep credential plain for compatibility with current auth fallback in this codebase.
INSERT INTO users (
    id, 
    tenant_id,
    name, 
    email, 
    password_hash, 
    role, 
    created_at, 
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    (
        SELECT id
        FROM tenants
        WHERE slug = 'default'
        LIMIT 1
    ),
    'Super Admin',
    'superadmin@xamina.local',
    'P@ssw0rd123!',
    'super_admin',
    NOW(),
    NOW()
) ON CONFLICT (tenant_id, email) DO NOTHING;
