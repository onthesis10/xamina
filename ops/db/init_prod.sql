# RLS Enforcement and Production Role Init Script
# Di-eksekusi manual atau via CI/CD ketika provisioning Azure Flex Server / RDS

-- 1. Security Hardening
REVOKE ALL ON DATABASE xamina FROM PUBLIC;
GRANT CONNECT ON DATABASE xamina TO postgres; 
-- (Opsional: Buat role khusus `xamina_app` dengan permission terbatas)

-- 2. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. Strict Row Level Security Enforcement
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
ALTER TABLE exams FORCE ROW LEVEL SECURITY;
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE questions FORCE ROW LEVEL SECURITY;

-- Catatan: Role backend postgres/superadmin wajib diberi ijin BypassRLS jika memang pooling connection tak disupply app.tenant_id
-- Namun Xamina Murni mengandalkan klaim JWT untuk Role Super_Admin. 
