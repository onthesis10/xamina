# Audit Row-Level Security (RLS) Policies

Dokumen ini memuat _checklist_ audit keamanan dan arsitektur pada implementasi Multi-Tenant Xamina Server menggunakan standar _PostgreSQL Row-Level Security (RLS)_.

## Mekanisme Eksekusi RLS
Sistem RLS Postgres pada layanan _backend_ Xamina diinisialisasikan per-_request_ melalui *middleware middleware/tenant_context.rs*:
1. Menarik `tenant_id` dan `role` dari dekode _JWT payload_.
2. Menyetel sesi dengan instruksi `set_config('app.tenant_id', ...)` pada pool `SQLx`.

## Hasil Audit (Sprint 7)
### 1. Perlindungan _Tenant Bounce_
- **Skenario:** Pengguna dengan akses normal (Guru/Siswa/Admin) mencoba memaksa mengakses API dengan memalsukan header JWT atau Inject `X-Tenant-Id` dari Tenant B.
- **Validasi RLS:** `FAIL-SECURE`. Middleware secara mutlak memblokir `X-Tenant-Id` kecuali Role-nya memiliki entitas `"super_admin"`. Row Level Security secara kaku membandingkan field `tenant_id` dari DB dengan JWT token paten. 

### 2. Bypass Limitasi (Zero-Trust SuperUser)
- **Skenario:** SuperAdmin melakukan monitoring seluruh _aggregate metrics_ platform di `TenantsPanel.tsx`. 
- **Validasi RLS:** SuperAdmin dikecualikan dari _policy limits_. Pada migrasi `0009_sprint7_multitenant_rls.sql`, tabel RLS memiliki logika bypass untuk administrator platform (Superadmin terhindar dari _blind spots_ akibat enkapsulasi ketat `admin`).

## Tindakan Pengamanan yang Diperlukan Sebelum _Production_:
- [ ] Memastikan `PostgreSQL` Role tidak memiliki flag `BYPASSRLS` secara _default_. Akses bypass mutlak hanya tersedia menggunakan variabel sesi.
- [ ] Menambahkan _Connection Pooler_ kompatibel seperti **PgBouncer** pada mode `session` (BUKAN `transaction`, karena akan menghilangkan state param `app.tenant_id`). Jika menggunakan Transaction Mode, reset _state_ pada koneksi sangat krusial.
- [ ] Menjaga kerahasiaan panjang (byte-length) dari `JWT_SECRET` via Azure Key Vault / AWS KMS untuk mencegah serangan _Forged JWT Signatures_.
