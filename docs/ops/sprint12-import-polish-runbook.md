# Sprint 12 Import + Beta Polish Runbook

## Tujuan
Dokumen operasional untuk factual closure Sprint 12: import `DOCX/XLSX`, global/import rate limit, response compression, onboarding tour, loading skeleton, dan download template resmi.

## Source of truth
- Backend import routes:
  - `POST /api/v1/questions/import/preview`
  - `POST /api/v1/questions/import/commit`
  - `GET /api/v1/questions/import/template.xlsx`
  - `GET /api/v1/questions/import/template.docx`
- Frontend onboarding store:
  - `xamina-ui-storage`
  - `coreTourStatus`
  - `coreTourStep`

## Prasyarat
- Docker Desktop aktif.
- Dependency backend/frontend sudah ter-install.
- Browser Playwright Chromium sudah tersedia:
  - `cd xamina-frontend`
  - `npx playwright install chromium`

## Runner evidence
Gunakan runner factual Sprint 12:

```powershell
./ops/loadtest/run_sprint12_runtime_evidence.ps1
```

Runner akan:
- start `postgres-test` dan `redis` via `docker compose --profile test`
- menjalankan compile gate backend:
  - `cargo check -p api`
  - `cargo test -p api --test question_import_rate_limit_integration --no-run`
- menjalankan runtime gate backend pada ignored integration tests:
  - download template XLSX/DOCX
  - XLSX preview + commit
  - DOCX preview
  - import rate limit + gzip compression
- menjalankan frontend gate:
  - `npm run build`
  - `npx playwright test e2e/sprint12-import-onboarding.spec.ts --project=chromium`

## Artefak
Runner menyimpan artefak ke `ops/load/reports`:
- `sprint12-runtime-evidence-*.json`
- `sprint12-backend-gates-*.log`
- `sprint12-frontend-gates-*.log`

## Interpretasi hasil
- Sprint 12 dapat ditandai `DONE` jika semua gate pada summary JSON `passed=true`.
- Beta launch nyata 5-10 sekolah tetap dicatat `BLOCKED-EXTERNAL`; bukan blocker untuk closure repo-level Sprint 12.
- Setelah Sprint 10, 11, dan 12 semuanya `DONE`, Phase Beta dinyatakan berakhir dan eksekusi berikutnya pindah ke Sprint 13.
