# Sprint 14 SuperAdmin & Production Infra Runbook

## Tujuan
- Menyediakan baseline operasional Sprint 14 di level repo:
  - SuperAdmin platform observability (analytics, health, audit log).
  - Template reverse proxy production (Nginx + TLS).
  - Backup/restore PostgreSQL.
  - Integrasi monitoring Prometheus/Grafana existing.

## Scope Endpoint Sprint 14
- `GET /api/v1/platform/analytics/overview`
- `GET /api/v1/platform/system/health`
- `GET /api/v1/platform/ai-config`
- `PATCH /api/v1/platform/ai-config`
- `GET /api/v1/platform/audit-logs`

## Local Verification
1. Start dependencies:
   - `docker compose up -d postgres redis`
2. Start API + frontend dari source terbaru.
3. Login sebagai `super_admin`.
4. Verifikasi UI:
   - `/app/platform/console`
   - `/app/platform/audit-logs`
5. Verifikasi API via curl/Postman:
   - endpoint analytics/health/ai-config/audit-logs merespons `200`.

## Nginx + TLS Baseline
- Gunakan template: `ops/nginx/xamina.conf.template`.
- Ganti `server_name` dan path sertifikat sesuai domain production.
- Pastikan upstream:
  - API: `127.0.0.1:8080`
  - Frontend: `127.0.0.1:3000` (atau static hosting final)

## Backup & Restore PostgreSQL
- Backup:
  - `./ops/backup/run_postgres_backup.ps1`
- Restore:
  - `./ops/backup/restore_postgres_backup.ps1 -BackupFile "<path>" -DropAndRecreate`

## Monitoring
- Prometheus config: `ops/monitoring/prometheus.yml`
- Grafana dashboards: `ops/monitoring/grafana/dashboards/xamina-api-mvp.json`
- Jalankan profile monitoring:
  - `docker compose --profile monitoring up -d prometheus grafana`

## Acceptance Checklist Sprint 14 (Repo-Level)
- [ ] Backend endpoint Sprint 14 tersedia dan guarded untuk `super_admin`.
- [ ] Frontend route superadmin console + audit log tersedia.
- [ ] Audit log tercatat untuk aksi mutasi platform penting.
- [ ] Baseline Nginx/TLS + backup/restore script tersedia.
- [ ] Monitoring stack lokal dapat dijalankan.

## Catatan
- Deployment cloud, provisioning SSL publik, dan hardening production host final tetap bergantung environment eksternal.
