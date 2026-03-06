# Sprint 10 SMTP + Push Runbook

## Tujuan
Dokumen operasional untuk notifikasi email sertifikat dan web push basic.

## Prasyarat
- API sudah running.
- `mailpit` aktif untuk local dev (`docker compose up -d mailpit`).
- Env backend terisi:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
  - `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_STARTTLS`
  - `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`

## Validasi cepat
1. Trigger finish submission yang lulus.
2. Cek tabel:
   - `certificates`
   - `email_jobs`
   - `push_jobs`
3. Cek mailbox local:
   - Mailpit UI: `http://localhost:8025`
4. Cek notifikasi push subscription:
   - endpoint `GET /api/v1/notifications/push/public-key`
   - endpoint `POST /api/v1/notifications/push/subscribe`

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

## Rotasi credential
- Ganti SMTP credential di environment.
- Ganti VAPID key pair.
- Restart service API setelah rotasi.
