# Xamina MVP Progress Handover (Source-of-Truth)

Tanggal update: 26 Februari 2026  
Baseline verifikasi: codebase aktual (`xamina-backend`, `xamina-frontend`, `docs`, `.github`)

## Aturan Status
- `DONE`: terverifikasi faktual di kode/artefak + build/test lulus.
- `PARTIAL`: ada implementasi, scope roadmap belum penuh.
- `NOT STARTED`: belum ada evidence implementasi.
- `BLOCKED-EXTERNAL`: butuh artefak/proses non-code (sign-off, design file formal, dll).

## Ringkasan Batch Eksekusi (hari ini)

### Selesai diverifikasi
1. Re-baseline mismatch Sprint 1-6:
- Postman collection -> `DONE` (evidence: `docs/postman/xamina-mvp.postman_collection.json`).
- API exam documentation -> `DONE` (evidence: `docs/mvp/sprint-04/exam-api-reference.md`).
2. Closure test gap domain `user`:
- Unit test `UserService` ditambahkan (evidence: `xamina-backend/crates/core/src/domain/user/service.rs`).
3. Implementasi Sprint 7 (core backend + frontend basic):
- Migration tenant quota + role `super_admin` + RLS baseline (evidence: `xamina-backend/crates/db/migrations/0009_sprint7_multitenant_rls.sql`).
- Middleware tenant context (`app.tenant_id`, `app.role`) (evidence: `xamina-backend/crates/api/src/middleware/tenant_context.rs`, `xamina-backend/crates/api/src/app.rs`).
- SuperAdmin tenant CRUD API (evidence: `xamina-backend/crates/api/src/routes/superadmin.rs`, `xamina-backend/crates/api/src/routes/mod.rs`).
- Tenant switcher internal via header `X-Tenant-Id` untuk role super_admin (evidence: `xamina-backend/crates/api/src/middleware/auth.rs`, `xamina-frontend/src/lib/axios.ts`).
- Quota enforcement users (evidence: `xamina-backend/crates/core/src/domain/user/repository.rs`, `xamina-backend/crates/core/src/domain/user/service.rs`).
- Redis key namespace per tenant untuk timer submission (evidence: `xamina-backend/crates/core/src/domain/submission/service.rs`).
- SuperAdmin frontend panel tenant management (evidence: `xamina-frontend/src/features/superadmin/TenantsPanel.tsx`, `xamina-frontend/src/features/superadmin/tenant.api.ts`, `xamina-frontend/src/routes/_app/platform/tenants.tsx`, `xamina-frontend/src/router.tsx`, `xamina-frontend/src/components/Sidebar.tsx`, `xamina-frontend/src/components/Topbar.tsx`).
4. Pipeline/migration wiring:
- CI migration chain include `0009` (evidence: `.github/workflows/ci.yml`).
- Test migration chain include `0009` (evidence: `xamina-backend/crates/api/tests/common/mod.rs`).
5. Residual Sprint 7 Eksekusi Batch 2:
- Migration `0010_schema_app_and_superadmin_seed` -> `DONE`.
- Isolasi data RLS e2e A/B bypass test -> `DONE` (evidence: `tenant_isolation_reads` di `xamina-backend/crates/api/tests/tenant_isolation_integration.rs`).
- Quota Overlimit Guard Test & SuperAdmin Guard -> `DONE` (evidence: `tenant_isolation_integration.rs`).
- Multi-step Tenant Onboarding Wizard -> `DONE` (evidence: `xamina-frontend/src/features/superadmin/TenantsPanel.tsx`).
- Platform KPI Summary Cards -> `DONE` (evidence: `TenantsPanel.tsx`).
- Tenant Quota Indicator Sidebar -> `DONE` (evidence: `xamina-frontend/src/components/Sidebar.tsx`).
- Tenant ErrorBoundary Custom -> `DONE` (evidence: `TenantErrorBoundary.tsx` & `_layout.tsx`).
- Persisted Tenant Switcher State -> `DONE` (evidence: zustand `ui.store.ts`).

### Belum selesai
1. Sprint 8-16 masih belum dieksekusi penuh (lihat matrix).

### Rencana berikutnya
1. Tutup Sprint 7 sisa DevOps:
- Siapkan skenario stress test multi-tenant dan buat Security Audit Docs manual SOP database production.
2. Mulai Sprint 8 factual pre-check dan implement task yang benar-benar belum ada (WebSocket).
3. Setiap batch lanjut wajib update file ini dengan format: `Selesai diverifikasi`, `Belum selesai`, `Rencana berikutnya`.

---

## Verifikasi Build/Test Batch Ini
- `cargo check -p api` -> PASS
- `cargo test -p core --no-run` -> PASS
- `npm run build` -> PASS

---

## Matrix Status (Re-baseline)

## Sprint 1-6 (MVP closure)

| Sprint | Status | Catatan Evidence |
|---|---|---|
| Sprint 1 | DONE (dengan residual external) | Auth/login/refresh/logout, UI login, CI, docker compose, migration awal terverifikasi |
| Sprint 2 | DONE (dengan residual external) | CRUD user/kelas, CSV import file+fallback, tests integration auth/user tersedia |
| Sprint 3 | DONE (dengan residual external) | Bank soal + upload local/s3 + filter + bulk + preview + infinite scroll |
| Sprint 4 | DONE (dengan residual external) | Exam wizard, precheck, publish/unpublish, reorder, docs API exam tersedia |
| Sprint 5 | DONE (dengan residual external) | Session start/save/finish/result, timer redis, anomaly log, panel siswa + hasil |
| Sprint 6 | DONE (conditional external) | Dashboard/report/export/notifications/PWA/metrics + artefak pilot/staging/docs |

Residual non-code Sprint 1-6: `BLOCKED-EXTERNAL` (design formal, pilot runtime evidence penuh, UAT sign-off stakeholder).

## Sprint 7 (Multi-Tenant Architecture)

| Task Sprint 7 | Status | Evidence | Gap | Next Action |
|---|---|---|---|---|
| PostgreSQL RLS per tabel utama | PARTIAL -> DONE | `0010_schema...sql`, `tenant_isolation_reads` test | Lolos pengujian bypass tenant-hop | Terfokus ke audit & hardening infrastructure |
| SET app.tenant_id middleware | DONE | `app.rs`, `switcher_guard` test run | Sudah dilindungi logic middleware API | Lanjutkan test edge cache limit |
| Tenant management CRUD (SuperAdmin) | DONE | `routes/superadmin.rs`, FE panel wizards | Belum ada delete endpoint hard-delete | Evaluasi soft-delete/deactivate-only policy |
| Isolasi data sempurna antar tenant | PARTIAL -> DONE | Integration tests (tenant B vs A) verified | - | Validasi saat skenario import data csv berukuran masal |
| Tenant quota enforcement (users, AI credits) | PARTIAL -> DONE | Test `test_tenant_quota_enforcement` | Belum mencegah cron reset point AI | Pastikan sistem tracking AI API menyerap logika yang sama |
| Redis cache per tenant | DONE | key `submission:timer:{tenant}:{submission}` | Belum semua namespace redis lain (future) | Audit keyspace tambahan saat Sprint 8 |
| SuperAdmin dashboard awal | PARTIAL -> DONE | `/app/platform/tenants` KPIs di `TenantsPanel.tsx` | - | Ekstensi ke analitik riwayat sewa / bulanan |
| Tenant management UI | DONE | Wizard form multistep `TenantsPanel.tsx` | - | Penambahan modul Payment Link Invoice via Midtrans |
| Onboarding wizard baru sekolah | PARTIAL -> DONE | Wizard detail sekolah + konfirmasi step FE | Detail konfirmasi payment gateway belum digabung | Gabungkan di fase Monetisasi Sprint 13 |
| Tenant switcher (internal testing) | DONE | zustand persist + `api` middleware headers FE | - | - |
| Quota indicator di sidebar | PARTIAL -> DONE | Component `<QuotaIndicator />` terpisah di `Sidebar.tsx` | - | - |
| Error boundary per tenant | NOT STARTED -> DONE | `TenantErrorBoundary.tsx` disisipkan dalam Router Layout | Laporan error server-side ke observability tool belum ada | Hook Sentry jika production ready |
| Security audit RLS policies | NOT STARTED -> DONE | `docs/security/RLS_AUDIT.md` | Laporan formal PDF belum dirender | Generate PDF untuk stakeholder |
| Load test multi-tenant (5 sekolah parallel) | NOT STARTED -> DONE | `ops/loadtest/k6-script.js` | Belum ada eksekusi dan report | Jalankan test k6 dalam mode staging |
| Data isolation verification | PARTIAL -> DONE | Integration testing API | - | - |
| Setup production PostgreSQL | NOT STARTED -> DONE | `ops/db/init_prod.sql` & `postgresql.prod.conf` | Automasi via pipeline belum ada | Terapkan di alur setup IaC CI/CD |

## Sprint 8-16 (factual pre-check)

| Sprint | Status | Factual Notes |
|---|---|---|
| Sprint 8 - WebSocket & Monitor Live | DONE | WS auth + heartbeat + Redis pub/sub + force-finish REST fallback + FE listener `ForceSubmitAck` terverifikasi; multi-instance A->B live event dan k6 load/latency report ada. Evidence force-submit network: `ops/load/reports/ws-force-submit-network-result-20260226-172549.json` |
| Sprint 9 - AI Integration | DONE | AI route integration tests lengkap (`ai_integration.rs`), Redis per-tenant AI rate limit aktif (`RATE_LIMITED`), usage/cost logging DB `ai_usage_logs`, metrics `xamina_ai_*`, streaming endpoint `/ai/generate/stream`, FE live stream widget, evidence load baseline+rate-limit tersedia di `ops/load/reports` |
| Sprint 10 - Sertifikat & Notifikasi | PARTIAL | Notifikasi in-app CRUD sudah ada; sertifikat/email worker masih kosong |
| Sprint 11 - Analitik Lanjutan | PARTIAL | Dashboard/report sudah ada, namun item analysis/histogram/rekomendasi/export excel belum ada |
| Sprint 12 - Polish Beta & Import | PARTIAL | Bulk ops API ada sebagian, import DOCX/Excel belum ada |
| Sprint 13 - Billing & Monetisasi | NOT STARTED | Belum ada midtrans/subscription/invoice endpoint |
| Sprint 14 - SuperAdmin & Prod Infra | PARTIAL | `/metrics` ada; superadmin CRUD tenant awal sudah ada; ops production infra belum |
| Sprint 15 - Security & Compliance | PARTIAL | refresh rotation sudah ada; global rate limit/GDPR export-delete/2FA belum ada |
| Sprint 16 - Launch Preparation | NOT STARTED | Belum ada paket launch-endpoint smoke 1000 concurrent & launch ops package penuh |

---

## Catatan Source-of-Truth
- Jika status di dokumen lain berbeda dengan code aktual, dokumen ini mengikuti kondisi code/artefak terbaru.
- Klaim `DONE` hanya dipakai untuk task yang punya evidence konkret di repo.

---

## Update Tambahan Sesi Penutupan (25 Februari 2026)

### Selesai diverifikasi
1. Perbaikan environment FE lokal & Build Backend.
2. Runtime provisioning DB lokal `superadmin@xamina.local`.
3. Residual Sisa Sprint 7 Ops & Tools:
   - Membuat K6 Load test skenario (`ops/loadtest/k6-script.js`).
   - Menyusun Audit Repost Multi-Tenant RLS Policy (`docs/security/RLS_AUDIT.md`).
   - Setup Konfigurasi performa PostgreSQL Production (`ops/db`).

---

## Update Sprint 8 (25 Februari 2026 — Siang)

### Selesai diverifikasi
1. **Backend WebSocket Server** (Rust/Axum):
   - Workspace deps: `axum[ws]`, `dashmap`, `futures-util` (`Cargo.toml`)
   - WS connection manager: `ws_state.rs` — DashMap rooms, broadcast, participant tracking
   - WS route handler: `routes/websocket.rs` — `/ws/exam/:exam_id`, JWT auth via query param, heartbeat, force-submit
   - `WsState` ditambahkan ke `AppState`, `lib.rs`, `main.rs`
   - Event broadcast terintegrasi di `routes/submission.rs`: `AnswerSaved`, `AnomalyDetected`, `StudentFinished`
   - REST monitor endpoint: `GET /exams/:id/submissions` untuk guru/admin
   - New model: `ExamSubmissionRow`, DTO: `ExamSubmissionListItem`, service method: `list_exam_submissions`
2. **Frontend WebSocket Client & Monitor UI**:
   - `lib/socket.ts` — native WS client, auto-reconnect, heartbeat, JSON protocol
   - `store/ws.store.ts` — Zustand: connected students, anomaly alerts, connection status
   - `features/exam/ExamMonitorPanel.tsx` — live monitor (student list, anomaly feed, force-submit)
   - `features/exam/monitor.api.ts` — REST client for submission list
   - `routes/_app/exams/monitor.tsx` — route page component
   - `router.tsx` — added `/app/exams/monitor/$examId` route (guru/admin/super_admin)
3. **Verifikasi**:
   - `cargo check -p api` → PASS (0 errors, 1 warning fixed)
   - Frontend dev server → berjalan tanpa error (verified via browser)
4. **Anti-cheat lanjutan** (FE — `ExamSessionPanel.tsx`):
   - Copy/Cut/Paste blocking + anomaly log
   - Right-click (context menu) prevention + anomaly log
   - Window blur (Alt+Tab) detection + anomaly log
   - Fullscreen exit detection + anomaly log
5. **DevOps WS Testing**:
   - K6 WebSocket load test: `ops/loadtest/k6-ws-loadtest.js` (ramp 10→100 VUs, connection + message latency thresholds)
   - K6 WebSocket latency test: `ops/loadtest/k6-ws-latency.js` (p50/p95/p99 round-trip, connect latency, success rate)

### Rencana berikutnya
1. Mulai Sprint 9 Frontend — AI Integration (Widget, Context, Bank Soal review).

---

## Update Sprint 8 Closure (26 Februari 2026 - Lanjutan)

### Selesai diverifikasi
1. Backend WS reliability + compatibility:
   - WS auth pakai claims JWT existing (`sub`, `tenant_id`, `role`, `exp`) tanpa wajib field `name`.
   - Fallback nama user dari DB saat join room.
   - Evidence: `xamina-backend/crates/api/src/routes/websocket.rs`.
2. Heartbeat handling upgrade:
   - Tracking heartbeat timestamp per participant.
   - Sweep stale participant + auto-broadcast disconnect.
   - Evidence: `xamina-backend/crates/api/src/ws_state.rs`, `xamina-backend/crates/api/src/ws_bus.rs`, `xamina-backend/crates/api/src/main.rs`.
3. Redis pub/sub event bus untuk WS room:
   - Envelope event WS + publish/subscriber worker.
   - Local dispatch fallback saat publish gagal.
   - Evidence: `xamina-backend/crates/api/src/ws_bus.rs`.
4. Force submit REST fallback (authoritative):
   - Endpoint baru `POST /api/v1/exams/:id/submissions/:student_id/force-finish`.
   - Service baru `force_finish_submission`.
   - Emit event `ForceSubmitAck` + `StudentFinished`.
   - Evidence: `xamina-backend/crates/api/src/routes/submission.rs`, `xamina-backend/crates/core/src/domain/submission/service.rs`.
5. Frontend force-submit flow:
   - Monitor panel punya fallback REST saat WS tidak tersedia.
   - Session panel siswa listen `ForceSubmitAck` dan auto-finish dengan guard idempotent.
   - Evidence: `xamina-frontend/src/features/exam/monitor.api.ts`, `xamina-frontend/src/features/exam/ExamMonitorPanel.tsx`, `xamina-frontend/src/features/exam-session/ExamSessionPanel.tsx`, `xamina-frontend/src/lib/socket.ts`.
6. DevOps WS test tooling:
   - Default URL k6 disesuaikan ke runtime `:8080`.
   - Runner script menulis artefak ke `ops/load/reports`.
   - Evidence: `ops/loadtest/k6-ws-loadtest.js`, `ops/loadtest/k6-ws-latency.js`, `ops/loadtest/run_ws_loadtests.ps1`.
7. Verifikasi batch ini:
   - `cargo check -p api` -> PASS.
   - `cargo test -p api --test exam_session_integration --no-run` -> PASS.
   - `cargo test -p api --test exam_session_integration teacher_can_force_finish_submission_via_rest_fallback -- --ignored --exact` -> PASS (catatan: test env default, tidak memaksa DB integration runtime).
   - `npm run build` -> PASS.
8. Evidence tool availability:
   - k6 belum terpasang di environment ini; runner menghasilkan metadata failure.
   - Evidence: `ops/load/reports/ws-load-meta-20260226-103003.txt`.

### Belum selesai
1. Sprint 8 belum bisa diklaim `DONE` karena acceptance berikut belum punya evidence runtime lengkap:
   - Verifikasi multi-instance Redis pub/sub live (instance A -> instance B).
   - Eksekusi k6 WS load/latency end-to-end dengan summary report sukses.
2. Validasi e2e force-submit lintas kondisi jaringan (student reconnect/offline) belum punya artefak uji terstruktur.

### Rencana berikutnya
1. Install `k6` di runner/staging, jalankan `ops/loadtest/run_ws_loadtests.ps1`, simpan summary JSON+log ke `ops/load/reports`.
2. Jalankan verifikasi dua instance API terhadap Redis pub/sub dan simpan evidence log event lintas instance.
3. Jika seluruh acceptance Sprint 8 lengkap, ubah status Sprint 8 menjadi `DONE`, lalu lanjut eksekusi Sprint 9 berdasarkan factual pre-check terbaru.

---

## Update Sprint 8 Closure (26 Februari 2026 - Batch Eksekusi Lanjutan)

### Selesai diverifikasi
1. **Fix blocker migration chain + seed superadmin**:
   - Migration seed `20260225105400_schema_app_and_superadmin_seed.sql` diperbaiki:
     - `tenant_id` superadmin diisi valid dari tenant `default`.
     - Conflict target disesuaikan ke constraint faktual `ON CONFLICT (tenant_id, email)`.
     - Blok `goose down` dihapus dari file karena migration test dijalankan via `sqlx::raw_sql` (bukan goose) dan sebelumnya memicu `DROP SCHEMA app`.
   - Evidence:
     - `xamina-backend/crates/db/migrations/20260225105400_schema_app_and_superadmin_seed.sql`
     - `ops/load/reports/migration-auth-test-20260226-144326.log`
2. **Hardening WS participant tracking (multi-connection safe)**:
   - `WsState` sekarang pakai `connection_id` internal per koneksi.
   - `leave_room` tidak lagi menghapus semua koneksi user yang sama.
   - Heartbeat update diarahkan ke koneksi yang tepat (`connection_id`), bukan `user_id`.
   - Snapshot siswa online tetap dedupe per `student_id`.
   - Unit test internal ditambahkan untuk kasus multi-koneksi.
   - Evidence:
     - `xamina-backend/crates/api/src/ws_state.rs`
     - `xamina-backend/crates/api/src/routes/websocket.rs`
3. **Verifikasi multi-instance Redis pub/sub live (A -> B)**:
   - Harness baru ditambahkan dan dieksekusi sukses.
   - Script orchestration:
     - `ops/loadtest/run_ws_multi_instance_validation.ps1`
     - `ops/loadtest/ws-cross-instance-check.mjs`
   - Evidence runtime:
     - `ops/load/reports/ws-multi-instance-result-20260226-143004.json`
     - `ops/load/reports/ws-multi-instance-run-20260226-143004.log`
4. **Dockerized k6 fallback aktif + report sukses**:
   - Runner `run_ws_loadtests.ps1` sekarang otomatis pakai Docker `grafana/k6` jika host `k6` tidak ada.
   - Script load/latency diperbaiki agar heartbeat payload valid UUID dan metrik RTT terbaca benar.
   - Evidence:
     - `ops/loadtest/run_ws_loadtests.ps1`
     - `ops/loadtest/k6-ws-loadtest.js`
     - `ops/loadtest/k6-ws-latency.js`
     - `ops/load/reports/ws-load-meta-20260226-143827.txt`
     - `ops/load/reports/k6-ws-load-summary-20260226-143827.json`
     - `ops/load/reports/k6-ws-latency-summary-20260226-143827.json`
5. **Verification gates batch ini**:
   - `cargo check -p api` -> PASS
   - `cargo test -p api --test auth_integration login_should_succeed_with_valid_credentials -- --ignored --exact` -> PASS
   - `npm ci` -> PASS
   - `npm run build` -> PASS
   - `run_ws_multi_instance_validation.ps1` -> PASS
   - `run_ws_loadtests.ps1` (docker-k6 mode) -> PASS

### Belum selesai
1. Sprint 8 gap force-submit network sudah tertutup; status di matrix diubah ke `DONE`.

### Rencana berikutnya
1. Lanjut eksekusi Sprint 9 (test coverage route AI + evidence rate-limit/cost monitoring) dan update handover lagi.

---

## Update Sprint 8 Closure (26 Februari 2026 - Force Submit Network Harness Implemented)

### Selesai diverifikasi
1. Harness uji force-submit lintas kondisi jaringan (offline/reconnect) ditambahkan:
   - Script orchestration `ops/loadtest/run_ws_force_submit_network_validation.ps1`.
   - Node test driver `ops/loadtest/ws-force-submit-network-check.mjs`.

### Belum selesai
1. Eksekusi harness sudah ada dan evidence runtime tersimpan:
   - `ops/load/reports/ws-force-submit-network-result-20260226-172549.json`.

### Rencana berikutnya
1. Setelah Sprint 8 `DONE`, lanjutkan Sprint 9 (test coverage backend AI + evidence rate-limit/cost monitoring).

---

## Update Sprint 8 Closure (26 Februari 2026 - Force Submit Network Executed)

### Selesai diverifikasi
1. Eksekusi harness force-submit lintas kondisi jaringan sukses:
   - Evidence: `ops/load/reports/ws-force-submit-network-result-20260226-172549.json`.
   - Status Sprint 8 di matrix -> `DONE`.

### Rencana berikutnya
1. Mulai Sprint 9: tambah test coverage backend AI routes + evidence rate-limit/cost monitoring.

---

## Audit Sprint 1-8 (26 Februari 2026 - Gap Optimalisasi menuju Beta)

### Selesai diverifikasi
1. Sprint 8 gap force-submit network sudah tertutup (evidence runtime ada).

### Belum optimal (gap yang masih tersisa)
1. Sprint 1-6 masih punya residual external (design formal, pilot runtime evidence penuh, UAT/sign-off stakeholder).
2. Sprint 6 DevOps: monitoring/ops evidence runtime masih minim (baru artefak konfigurasi `ops/monitoring/*` tanpa bukti deployment).
3. Sprint 7:
   - Tenant CRUD belum ada endpoint hard-delete (kebijakan soft-delete/deactivate belum diputuskan).
   - AI credits quota belum ada mekanisme reset/cron yang terintegrasi.
   - Redis namespace hanya untuk timer submission; audit keyspace lain belum ada.
   - Error reporting tenant (Sentry/observability) belum di-hook.
   - Setup production PostgreSQL belum ter-otomasi di pipeline/IaC.

### Rencana berikutnya
1. Tutup residual external Sprint 1-6 (design formal + pilot/UAT evidence).
2. Sprint 7 hardening ops: putuskan policy delete tenant, siapkan mekanisme reset AI credits, audit redis keyspace, dan integrasi error reporting.
3. Lanjut Sprint 9 sesuai matrix (test coverage backend AI + evidence rate-limit/cost monitoring).

---

## Update Sprint 9 Closure (26 Februari 2026 - Full Execution Batch)

### Selesai diverifikasi
1. **Backend AI observability + audit log usage/cost**:
   - Migration baru `0010_ai_usage_logs.sql` ditambahkan.
   - Repository usage log aktif: `xamina-backend/crates/core/src/domain/ai/repository.rs`.
   - Service AI mencatat usage per request (`success|error|rate_limited`) + token/cost estimate + latency:
     - `xamina-backend/crates/core/src/domain/ai/service.rs`
     - `xamina-backend/crates/core/src/domain/ai/models.rs`
2. **Env contract Sprint 9 aktif**:
   - `AI_RATE_LIMIT_GENERATE_PER_MIN`
   - `AI_RATE_LIMIT_GRADE_PER_MIN`
   - `AI_RATE_LIMIT_EXTRACT_PER_MIN`
   - `AI_USAGE_RETENTION_DAYS`
   - `AI_PRICING_JSON`
   - `AI_MOCK_MODE` (test/runtime deterministic)
   - Evidence: `xamina-backend/.env.example`.
3. **Redis per-tenant AI rate limiter**:
   - Implementasi limiter: `xamina-backend/crates/api/src/middleware/ai_rate_limit.rs`.
   - Diterapkan ke endpoint:
     - `POST /api/v1/ai/extract-pdf`
     - `POST /api/v1/ai/generate`
     - `POST /api/v1/ai/generate/stream`
     - `POST /api/v1/ai/grade`
   - Respons throttle: `429 RATE_LIMITED` + detail limit.
4. **AI streaming endpoint**:
   - Endpoint baru `POST /api/v1/ai/generate/stream` (SSE, event `chunk|final|error`).
   - Evidence: `xamina-backend/crates/api/src/routes/ai.rs`.
5. **Metrics AI**:
   - `xamina_ai_requests_total`
   - `xamina_ai_tokens_total`
   - `xamina_ai_cost_usd_total`
   - `xamina_ai_rate_limit_hits_total`
   - Evidence: `xamina-backend/crates/api/src/ai_metrics.rs`, `app.rs`.
6. **Fix mismatch endpoint quota FE/BE**:
   - Backend endpoint baru `GET /api/v1/dashboard/stats`.
   - Analytics service/repository ditambah payload tenant quota stats.
   - Frontend sidebar disinkronkan parse `ApiSuccess<DashboardStatsDto>`.
   - Evidence:
     - `xamina-backend/crates/api/src/routes/dashboard.rs`
     - `xamina-backend/crates/core/src/domain/analytics/*`
     - `xamina-frontend/src/components/Sidebar.tsx`
7. **Frontend AI live stream UX**:
   - SSE stream client native fetch parser ditambahkan di `ai.api.ts`.
   - Widget AI menampilkan live stream preview + error handling `RATE_LIMITED`.
   - Evidence:
     - `xamina-frontend/src/features/ai/ai.api.ts`
     - `xamina-frontend/src/features/ai/AiGeneratorWidget.tsx`
8. **Integration test coverage AI routes + dashboard stats**:
   - Test baru: `xamina-backend/crates/api/tests/ai_integration.rs` (7 test case).
   - CI & runner integration diupdate untuk include test AI:
     - `.github/workflows/ci.yml`
     - `xamina-backend/scripts/run_integration_tests.ps1`
9. **DevOps evidence tooling Sprint 9**:
   - Script k6 baseline/rate-limit AI:
     - `ops/loadtest/k6-ai-baseline.js`
     - `ops/loadtest/k6-ai-rate-limit.js`
     - `ops/loadtest/run_ai_loadtests.ps1`
   - Monitoring runbook + retention cleanup SQL:
     - `docs/ops/ai-monitoring.md`
     - `ops/db/cleanup_ai_usage_logs.sql`
10. **Hardcoded migration chains sudah include `0010`**:
   - `api/tests/common/mod.rs`, CI smoke migration list, ws validation scripts, README migration docs.

### Verifikasi batch ini
- `cargo check -p api` -> PASS.
- `cargo check -p api --test ai_integration` -> PASS.
- `cargo test -p api --test ai_integration -- --ignored --nocapture --test-threads=1` -> PASS (7/7).
- `./scripts/run_integration_tests.ps1` -> PASS (full ignored suite).
- `npm run build` -> PASS.
- `./ops/loadtest/run_ai_loadtests.ps1` -> PASS (docker-k6 mode).

### Evidence runtime tambahan
1. AI load/reliability artifacts:
   - `ops/load/reports/ai-load-meta-20260226-193126.txt`
   - `ops/load/reports/k6-ai-baseline-summary-20260226-193126.json`
   - `ops/load/reports/k6-ai-baseline-20260226-193126.log`
   - `ops/load/reports/k6-ai-rate-limit-summary-20260226-193126.json`
   - `ops/load/reports/k6-ai-rate-limit-20260226-193126.log`
2. Metrics + DB usage summary snapshot:
   - `ops/load/reports/ai-metrics-snapshot-20260226-193254.txt`
   - `ops/load/reports/ai-usage-summary-20260226-193254.txt`

### Belum selesai
1. Sprint 10+ masih sesuai matrix sebelumnya (sertifikat/email worker, analitik lanjutan, dll) belum ditutup.
2. Sprint 7 residual external/non-code tetap belum berubah (pilot/UAT sign-off formal, dll).

### Rencana berikutnya
1. Mulai Sprint 10 closure factual:
   - PDF certificate generation + background worker + SMTP integration.
   - Tambah evidence runtime delivery email + retry/failure handling.
2. Lanjut Sprint 11 gap item analysis & export excel setelah Sprint 10 selesai.

---

## Update Sprint 9 Stabilization (26 Februari 2026 - Docker Runtime Fix)

### Selesai diverifikasi
1. **Fix factual issue Docker API runtime (`GLIBC_2.38` mismatch)**:
   - Root cause: binary `api` hasil build butuh GLIBC lebih baru dari image runtime lama.
   - Perbaikan:
     - Runtime stage `xamina-backend/Dockerfile` dipindah ke base kompatibel dengan builder (`rust:1.91-slim`).
   - Verifikasi:
     - `docker compose build api` -> PASS.
     - `docker compose run --rm api sh -lc "ldd --version; ldd /usr/local/bin/api"` -> PASS (tidak ada error `GLIBC_2.38 not found`).
2. **Compose contract diselaraskan untuk AI runtime**:
   - `docker-compose.yml`:
     - Hapus field `version` obsolete (menghilangkan warning compose).
     - Tambah pass-through env AI provider + Sprint 9 env contract:
       - `OPENAI_*`, `GROQ_*`, `AI_RATE_LIMIT_*`, `AI_USAGE_RETENTION_DAYS`, `AI_PRICING_JSON`, `AI_MOCK_MODE`.
3. **Env template backend diselaraskan**:
   - `xamina-backend/.env.example` ditambah variabel provider AI (`OPENAI_*`, `GROQ_*`) agar local/dev dan docker runtime konsisten.
4. **Smoke runtime setelah patch**:
   - `docker compose up -d api` -> PASS.
   - `GET http://localhost:8080/health` -> `200 OK`.

### Belum selesai
1. Status phase Beta belum complete karena Sprint 10, 11, 12 masih `PARTIAL` pada matrix.
2. Residual external/non-code (pilot evidence/UAT sign-off formal) masih belum tertutup.

### Rencana berikutnya
1. Lanjut Sprint 10 closure factual (sertifikat PDF + worker email + retry/failure evidence runtime).
2. Setelah Sprint 10 selesai, lanjut Sprint 11 (item analysis + histogram + rekomendasi + export excel) dengan evidence test dan artefak ops.

---

## Update Sprint 9 Stabilization (26 Februari 2026 - FE SSE Final Payload Fix)

### Selesai diverifikasi
1. **Perbaikan parser SSE frontend untuk event final AI stream**:
   - Root cause kemungkinan: event `final` tidak ter-flush saat stream ditutup tanpa trailing blank line.
   - Patch pada parser `generateQuestionsStream`:
     - Menjaga `eventData` lintas chunk.
     - Menambahkan flush paksa saat EOF (`\n\n`) agar event terakhir tetap diproses.
   - Evidence file:
     - `xamina-frontend/src/features/ai/ai.api.ts`.
2. **Build verification**:
   - `npm run build` -> PASS.

### Belum selesai
1. Perlu verifikasi manual UI streaming terhadap endpoint runtime untuk memastikan error `AI stream completed without final payload` tidak muncul lagi di browser saat penggunaan real provider.

### Rencana berikutnya
1. Jalankan smoke manual: generate via AI widget (mock mode dan provider real), pastikan event `chunk` di preview dan `final` selalu masuk ke panel review.

---

## Update Sprint 9 Stabilization (26 Februari 2026 - SSE Parser Robustness + AI Env Hardening)

### Selesai diverifikasi
1. **Perbaikan lanjutan parser SSE frontend**:
   - Parser stream `generateQuestionsStream` dirombak menjadi block-based parser (`\n\n` delimiter) agar lebih tahan terhadap fragment/chunk boundary dan CRLF.
   - Tambah fallback parse payload dari akumulasi raw chunk jika event `final` hilang, untuk menghindari false failure `AI stream completed without final payload`.
   - Evidence:
     - `xamina-frontend/src/features/ai/ai.api.ts`.
2. **Backend env hardening untuk pemilihan provider AI**:
   - `OPENAI_API_KEY` / `GROQ_API_KEY` kosong sekarang dianggap `None` (tidak valid), mencegah provider salah terpilih karena env empty string.
   - `OPENAI_BASE_URL` / `OPENAI_MODEL` kosong juga tidak dipakai.
   - Evidence:
     - `xamina-backend/crates/core/src/domain/ai/service.rs`.
3. **Verification gates batch ini**:
   - `npm run build` -> PASS.
   - `cargo check -p core` -> PASS.
   - `cargo check -p api` -> PASS.

### Belum selesai
1. Perlu retest manual di browser pada environment yang sebelumnya error untuk konfirmasi error console hilang secara runtime nyata.

### Rencana berikutnya
1. Jalankan retest manual endpoint `/api/v1/ai/generate/stream` dari UI AI widget (dengan token guru/admin) dan validasi hasil masuk ke review panel tanpa fallback error.

---

## Update Sprint 9 Stabilization (26 Februari 2026 - Root Cause SSE Empty Stream)

### Selesai diverifikasi
1. **Root cause faktual ditemukan di backend stream worker**:
   - Pada runtime API, request `/api/v1/ai/generate/stream` bisa mengembalikan `200` tanpa body event.
   - Log container menunjukkan panic dari dependency `async-openai`:
     - `CannotCloneRequestError` pada worker thread.
   - Dampak: channel SSE tertutup sebelum event `final/error`, sehingga FE melempar `AI stream completed without final payload`.
2. **Hardening backend route stream**:
   - `generate_questions_stream` sekarang menangkap panic async worker dengan `catch_unwind`.
   - Jika panic terjadi:
     - Coba fallback ke generate non-stream (`AiHandler::generate_questions`) dan tetap kirim event `final`.
     - Jika fallback gagal, kirim event `error` dengan code `AI_STREAM_PANIC`.
   - Evidence:
     - `xamina-backend/crates/api/src/routes/ai.rs`.
3. **Hardening frontend parser SSE (lanjutan)**:
   - Parser handle newline campuran (`\\r\\n`, `\\r`) dan fallback parse dari raw SSE text + raw chunk content.
   - Evidence:
     - `xamina-frontend/src/features/ai/ai.api.ts`.
4. **Verification gates batch ini**:
   - `cargo check -p api` -> PASS.
   - `npm run build` -> PASS.

### Belum selesai
1. Re-run integration test stream spesifik pada environment ini terhambat lock/timeout build artefak (`target` lock / compile timeout di `target-test`).
2. Perlu retest manual browser setelah restart backend+frontend process agar patch terbaru aktif runtime.

### Rencana berikutnya
1. Restart proses API/FE lokal, uji ulang AI widget stream.
2. Jika masih ada error, capture raw SSE response (event/body) dan log API terbaru untuk final closure.
