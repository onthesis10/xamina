# Xamina Backend MVP (Sprint 1-4)

## Run locally

1. Copy `.env.example` to `.env`.
2. Start dependencies:

```bash
docker compose up -d postgres redis minio
```

3. Run migrations manually using your SQL runner against `DATABASE_URL`:
- `crates/db/migrations/0001_extensions.sql`
- `crates/db/migrations/0002_core_auth.sql`
- `crates/db/migrations/0003_questions.sql`
- `crates/db/migrations/0004_exams.sql`
- `crates/db/migrations/0005_submissions.sql`
- `crates/db/migrations/0006_publish_conflict_indexes.sql`
- `crates/db/migrations/0007_notifications.sql`
- `crates/db/migrations/0008_dashboard_indexes.sql`
- `crates/db/migrations/0009_sprint7_multitenant_rls.sql`
- `crates/db/migrations/0010_ai_usage_logs.sql`
- `crates/db/migrations/0011_sprint10_certificates_delivery.sql`

4. Start API:

```bash
cargo run -p api
```

## Auth seed
- Email: `admin@xamina.local`
- Password hash is pre-seeded in migration (replace as needed for your environment).
- Upload mode aktif saat ini: `Local FS` (Sprint 3-4 closure).
- Optional upload config:
- `UPLOAD_MODE=local|s3` (default `local`)
- `UPLOAD_BASE_URL=http://localhost:8080/uploads/question-images` (used by local mode)
- `UPLOAD_MAX_BYTES=5242880` (default 5 MB)
- S3 mode required envs:
  - `S3_ENDPOINT`
  - `S3_REGION` (default `us-east-1`)
  - `S3_BUCKET`
  - `S3_ACCESS_KEY`
  - `S3_SECRET_KEY`
  - `S3_PUBLIC_BASE_URL` (optional, fallback `{S3_ENDPOINT}/{S3_BUCKET}`)
- `REDIS_URL=redis://localhost:56379`

Format URL upload saat ini:
- `/uploads/question-images/{tenant_id}/{file_name}`

Catatan:
- Endpoint upload tetap `POST /api/v1/uploads/question-image`.
- Mode `local`: simpan file ke `uploads/question-images/{tenant_id}`.
- Mode `s3`: upload object ke bucket/key `{tenant_id}/{file_name}`.

## API MVP endpoints
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/users`
- `POST /api/v1/users`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`
- `DELETE /api/v1/users/:id`
- `POST /api/v1/users/import-csv`
- `POST /api/v1/users/import-csv-file`
- `GET /api/v1/classes`
- `POST /api/v1/classes`
- `PATCH /api/v1/classes/:id`
- `DELETE /api/v1/classes/:id`
- `GET /api/v1/questions`
- `POST /api/v1/questions`
- `GET /api/v1/questions/:id`
- `PATCH /api/v1/questions/:id`
- `DELETE /api/v1/questions/:id`
- `POST /api/v1/questions/bulk-delete`
- `POST /api/v1/uploads/question-image`
- `GET /api/v1/exams`
- `POST /api/v1/exams`
- `GET /api/v1/exams/:id`
- `PATCH /api/v1/exams/:id`
- `DELETE /api/v1/exams/:id`
- `POST /api/v1/exams/:id/questions`
- `PATCH /api/v1/exams/:id/questions/reorder`
- `DELETE /api/v1/exams/:id/questions/:question_id`
- `GET /api/v1/exams/:id/publish-precheck`
- `POST /api/v1/exams/:id/publish`
- `POST /api/v1/exams/:id/unpublish`
- `POST /api/v1/exams/:id/start`
- `POST /api/v1/exams/:id/submissions/:student_id/force-finish`
- `GET /api/v1/me/exams`
- `GET /api/v1/submissions/:id`
- `POST /api/v1/submissions/:id/answers`
- `POST /api/v1/submissions/:id/anomalies`
- `POST /api/v1/submissions/:id/finish`
- `GET /api/v1/submissions/:id/result`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/reports/class-results`
- `GET /api/v1/reports/class-results/export.csv`
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `POST /api/v1/notifications/read-all`
- `POST /api/v1/ai/extract-pdf`
- `POST /api/v1/ai/generate`
- `POST /api/v1/ai/generate/stream`
- `POST /api/v1/ai/grade`
- `GET /health`

## CSV import rollout compatibility

- New multipart endpoint: `POST /api/v1/users/import-csv-file` (`multipart/form-data`, field `file`).
- Legacy endpoint kept: `POST /api/v1/users/import-csv` (text body).
- Minimum backend runtime for native file upload:
  - route `POST /api/v1/users/import-csv-file` must be present in `crates/api/src/routes/user.rs`.
- Frontend compatibility mode:
  - if `import-csv-file` returns `404/405`, frontend falls back automatically to legacy `import-csv`.

## Integration tests (publish rules)

1. Start isolated test database:

```bash
docker compose --profile test up -d postgres-test
```

2. Run integration suite:

```powershell
./scripts/run_integration_tests.ps1
```

Notes:
- Script sets `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55433/xamina_test?sslmode=disable`
- Tests are marked ignored by default and executed with `--ignored`.

## API smoke flow (core MVP)

Run minimal automation for:
`login -> create question -> create exam -> attach -> publish-precheck -> publish`

```powershell
./scripts/run_mvp_smoke.ps1
```

## Student session smoke flow (Sprint 5)

Run end-to-end student session:
`admin login -> create siswa -> create/publish exam -> siswa start -> answer -> finish -> result`

```powershell
./scripts/run_student_session_smoke.ps1
```

Optional env overrides:
- `API_BASE_URL` (default `http://localhost:8080/api/v1`)
- `TENANT_SLUG` (default `default`)
- `ADMIN_EMAIL` (default `admin@xamina.local`)
- `ADMIN_PASSWORD` (default `Admin123!`)

## Sprint 4 regression flow (API checklist)

Run focused API regression for Sprint 4 schedule/publish/manage rules:

```powershell
./scripts/run_sprint4_regression.ps1
```

## Sprint 6 regression flow (dashboard/report/notifications)

```powershell
./scripts/run_sprint6_regression.ps1
```

What it verifies:
- valid exam creation schedule
- invalid schedule rejection (`VALIDATION_ERROR`)
- precheck schedule issue (`SCHEDULE_REQUIRED`)
- publish blocked when schedule missing (`PUBLISH_FAILED`)
- detach blocked on published exam (`ATTACH_FAILED`)
- detach non-attached question on draft (`VALIDATION_ERROR`)
- unpublish back to draft

## Manual regression checklist (Sprint 4 bugfix pass)

Run this quick checklist for `guru/admin` after backend/frontend changes:

1. Create exam via wizard with valid schedule (`start_at < end_at`) and confirm save succeeds.
2. Enter invalid schedule (`start_at >= end_at`) and confirm UI blocks submit.
3. Run precheck on draft exam without schedule and confirm issue includes `SCHEDULE_REQUIRED`.
4. Publish is only possible when precheck says `publishable=true`.
5. Attach/reorder/detach only available for draft exam.
6. Detach on published exam must fail with `ATTACH_FAILED`.
7. Detach question not attached to draft exam must fail with `VALIDATION_ERROR`.

## CI parity gate (Sprint 3-4)

Local commands aligned with CI workflow (`.github/workflows/ci.yml`):

```bash
# backend check
cd xamina-backend
cargo check -p api

# frontend build
cd ../xamina-frontend
npm ci
npm run build

# integration tests
cd ../xamina-backend
./scripts/run_integration_tests.ps1

# smoke API flow
./scripts/run_mvp_smoke.ps1
```

## AI monitoring + load test (Sprint 9)

- Metrics endpoint includes:
  - `xamina_ai_requests_total`
  - `xamina_ai_tokens_total`
  - `xamina_ai_cost_usd_total`
  - `xamina_ai_rate_limit_hits_total`
- Usage logs stored in table `ai_usage_logs`.
- Retention cleanup SQL: `../ops/db/cleanup_ai_usage_logs.sql`
- Run AI load baseline + rate-limit:

```powershell
../ops/loadtest/run_ai_loadtests.ps1
```
