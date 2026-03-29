# Sprint 10 SMTP + Push Runbook

## Tujuan
Dokumen operasional untuk notifikasi email sertifikat dan web push basic.

## Prasyarat
- API sudah running.
- `mailpit` aktif untuk local dev (`docker compose up -d mailpit`).
- Migration runtime Sprint 10 sudah terpasang:
  - `xamina-backend/crates/db/migrations/0011_sprint10_certificates_delivery.sql`
  - `xamina-backend/crates/db/migrations/0012_sprint10_push_receipts.sql`
- Env backend terisi:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
  - `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_STARTTLS`
  - `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`
  - Catatan format: `WEB_PUSH_VAPID_PRIVATE_KEY` harus raw base64url (URL_SAFE_NO_PAD), bukan PEM.

## Build gate
- Default backend:
  - `cargo check -p api`
- Web push feature path:
  - `xamina-backend/scripts/run_real_web_push_check.ps1`
- Sprint 10 integration compile:
  - `cargo test -p api --test sprint10_certificate_notification_integration --no-run`
- Frontend:
  - `npm run build`

## Validasi cepat
1. Trigger finish submission yang lulus.
2. Cek tabel:
   - `certificates`
   - `email_jobs`
   - `push_jobs`
   - `push_delivery_receipts`
3. Cek mailbox local:
   - Mailpit UI: `http://localhost:8025`
4. Cek notifikasi push subscription:
   - endpoint `GET /api/v1/notifications/push/public-key`
   - endpoint `POST /api/v1/notifications/push/subscribe`
   - endpoint `POST /api/v1/notifications/push/receipt`
5. Untuk local factual smoke gunakan:
   - `ops/loadtest/run_sprint10_runtime_evidence.ps1`

## Retry policy
- Job `email_jobs` dan `push_jobs` menggunakan state:
  - `queued` -> `processing` -> (`sent` | `retry` | `failed`)
- Backoff eksponensial dari worker.
- Jika `attempts >= max_attempts`, state final `failed`.

## Troubleshooting
- Email tidak terkirim:
  - cek `email_jobs.last_error`
  - cek konektivitas ke `SMTP_HOST:SMTP_PORT`
- Push gagal:
  - cek `push_jobs.last_error`
  - validasi key VAPID terpasang
  - endpoint subscription invalid akan dibersihkan otomatis
- `push/subscribe` gagal dengan `DB_ERROR`:
  - verifikasi migration `0011_sprint10_certificates_delivery.sql` dan `0012_sprint10_push_receipts.sql` sudah diterapkan ke DB runtime, bukan hanya ada di repo

## Rotasi credential
- Ganti SMTP credential di environment.
- Ganti VAPID key pair.
- Restart service API setelah rotasi.
