# Sprint 13 Billing Sandbox Runbook

## Tujuan
Dokumen operasional untuk factual closure Sprint 13: tenant-admin billing self-serve, pricing publik, Midtrans sandbox checkout, webhook settlement, dan invoice PDF.

## Source of truth
- Public pricing API:
  - `GET /api/v1/billing/plans`
- Tenant-admin billing API:
  - `GET /api/v1/billing/summary`
  - `GET /api/v1/billing/history`
  - `POST /api/v1/billing/checkout`
  - `POST /api/v1/billing/change-plan`
  - `GET /api/v1/billing/invoices/:invoiceId/pdf`
- Super admin billing API tetap aktif:
  - `GET /api/v1/platform/tenants/:tenantId/billing/*`
- Midtrans webhook:
  - `POST /api/v1/billing/midtrans/webhook`

## Prasyarat
- Docker Desktop aktif.
- Rust toolchain dan dependency frontend/backend sudah ter-install.
- `xamina-backend/.env` terisi credential sandbox:
  - `MIDTRANS_SERVER_KEY`
  - `MIDTRANS_CLIENT_KEY`
  - `MIDTRANS_MERCHANT_ID`
- Redis lokal tersedia via `docker compose`.

## Runner evidence
Gunakan runner factual Sprint 13:

```powershell
./ops/loadtest/run_sprint13_billing_runtime_evidence.ps1
```

Runner akan:
- melakukan preflight Midtrans credential lebih awal (probe direct ke gateway sandbox) sebelum start runtime full.
- start `postgres-test` dan `redis` via `docker compose --profile test`
- reset DB test lalu apply migration `0001` s.d. `0014`
- start API lokal dengan override runtime:
  - `DATABASE_URL=postgres-test`
  - `BILLING_PROVIDER=midtrans`
  - `API_PORT=18080`
- login sebagai admin tenant default
- memanggil `GET /billing/plans`
- membuat checkout Midtrans sandbox nyata dari `POST /billing/checkout`
- memproses settlement webhook dengan signature valid
- mengunduh invoice PDF dari endpoint tenant-admin
- menyimpan artefak factual ke `ops/load/reports`

## Artefak
Runner menyimpan:
- `sprint13-runtime-evidence-*.json`
- `sprint13-api-runtime-*.log`
- `sprint13-api-runtime-*.err.log`
- `sprint13-midtrans-preflight-*.txt`
- `sprint13-invoice-*.pdf`

## Interpretasi hasil
- Sprint 13 dapat dinaikkan ke `DONE` bila:
  - backend integration billing PASS
  - frontend build dan Playwright billing PASS
  - runner sandbox menghasilkan `redirect_url` Midtrans nyata
  - webhook mengaktifkan subscription
  - invoice PDF terunduh dengan sukses
- Legal document finalisasi tetap dicatat `BLOCKED-EXTERNAL` bila belum ada artefak non-code resmi.

## Troubleshooting
- Checkout gagal dengan `BILLING_GATEWAY_ERROR`:
  - verifikasi `MIDTRANS_*` di `xamina-backend/.env`
  - pastikan merchant berada di mode sandbox
- Webhook gagal dengan `INVALID_SIGNATURE`:
  - cek `MIDTRANS_SERVER_KEY`
  - pastikan `order_id`, `status_code`, dan `gross_amount` sama dengan invoice checkout
- PDF invoice gagal diunduh:
  - verifikasi API berjalan dari root `xamina-backend` agar relative path `uploads/invoices/*` valid
- Jika port `18080` bentrok:
  - jalankan script dengan `-ApiBaseUrl http://127.0.0.1:<port>/api/v1`
