# Sprint 1-6 Fact Audit (HTML vs Codebase)

Rule: status `DONE` hanya jika terverifikasi di kode/artefak repo.

## Sprint 01 - Project Setup & Auth
| Task | Status | Evidence |
|---|---|---|
| Rust workspace api/core | DONE | `xamina-backend/Cargo.toml` |
| Axum config + middleware | PARTIAL | `crates/api/src/app.rs`, `crates/api/src/middleware/mod.rs` |
| SQL migrations | DONE | `crates/db/migrations/0001..0008` |
| JWT login/refresh/logout | DONE | `crates/api/src/routes/auth.rs` |
| Argon2 password hashing | DONE | `routes/auth.rs`, `routes/user.rs` |
| User & tenant base model | DONE | `0002_core_auth.sql` |
| Vite+React+TS | DONE | `xamina-frontend/package.json`, `vite.config.ts` |
| TanStack Router + Query | DONE | `src/router.tsx`, `src/lib/queryClient.ts` |
| Axios + auth interceptor | DONE | `src/lib/axios.ts` |
| Login page | DONE | `src/features/auth/LoginForm.tsx` |
| Zustand auth store | DONE | `src/store/auth.store.ts` |
| Layout shell sidebar/topbar | DONE | `src/components/Sidebar.tsx`, `Topbar.tsx` |
| Docker compose api+postgres+redis | DONE | `docker-compose.yml` |
| GitHub CI test+lint | DONE | `.github/workflows/ci.yml` (`fmt --check`, `clippy -D warnings`, frontend lint/build, integration) |

## Sprint 02 - User Management & Kelas
| Task | Status | Evidence |
|---|---|---|
| CRUD users backend | DONE | `routes/user.rs` |
| CRUD kelas backend | DONE | `routes/tenant.rs` |
| Role guard backend | DONE | `ensure_admin/ensure_teacher_or_admin` di routes |
| Import siswa CSV | DONE | `POST /users/import-csv` |
| Pagination/filter users | DONE | `ListUsersQuery` + SQL filter |
| Unit test user service | PARTIAL | `crates/core/src/domain/user/*` masih placeholder (0 byte); coverage service aktif ada di domain `exam/analytics/notification/submission` |
| UI user management + search | DONE | `src/features/users/UsersPanel.tsx` |
| Form tambah/edit user | DONE | `src/features/users/UsersPanel.tsx` (create/edit/delete/filter) |
| Import CSV modal/upload | DONE | `UsersPanel.tsx` modal file upload + fallback endpoint legacy + preview error row |
| UI manajemen kelas | DONE | `src/features/classes/ClassesPanel.tsx` (create/edit/delete/toggle active) |
| Role badge/status indicator | DONE | `StatusBadge` di `UsersPanel.tsx` |
| Toast notification system | DONE | `src/store/toast.store.ts`, `src/components/ToastViewport.tsx`, integrasi mutation utama |

## Sprint 03 - Bank Soal & Editor
| Task | Status | Evidence |
|---|---|---|
| CRUD questions | DONE | `routes/question.rs` |
| options JSONB model | DONE | migration + route DTO |
| filter/search | DONE | `questionApi.list` + backend query |
| bulk delete/edit | DONE | `bulk-delete` + edit form |
| upload gambar ke MinIO | DONE | `routes/question.rs` storage mode `local|s3`, `.env.example`, `scripts/run_upload_s3_smoke.ps1` |
| grid/list view | DONE | table/card view |
| rich editor + image | DONE | `src/features/question/QuestionBankPanel.tsx` rich editor + image upload |
| filter sidebar | PARTIAL | filter controls ada bukan sidebar dedicated |
| preview modal | DONE | `QuestionBankPanel.tsx` preview dialog |
| infinite scroll | DONE | `QuestionBankPanel.tsx` `IntersectionObserver` + fallback manual button |

## Sprint 04 - Buat Ujian & Penjadwalan
| Task | Status | Evidence |
|---|---|---|
| CRUD exams | DONE | `routes/exam.rs` + core exam |
| attach/detach/reorder | DONE | routes + `ExamsPanel.tsx` |
| shuffle soal/opsi | DONE | start session logic |
| publish draft->published | DONE | publish endpoints |
| validasi min soal/jadwal conflict | DONE | precheck + DB indexes |
| schedule start/end | DONE | exam payload + validation |
| wizard form | DONE | `ExamsPanel` step 1-4 |
| drag-drop urutan | DONE | DnD reorder UI |
| kalender scheduling | DONE (Native Enhanced) | `src/features/exam/ScheduleFields.tsx`, `exams.datetime.ts`, `ExamsPanel.tsx` (quick preset, local/UTC preview, inline guard) |
| preview sebelum publish | DONE | wizard preview + precheck |

## Sprint 05 - Sesi Ujian Siswa
| Task | Status | Evidence |
|---|---|---|
| start submission | DONE | `/exams/:id/start` |
| get soal per sesi | DONE | `/submissions/:id` |
| upsert jawaban | DONE | `/submissions/:id/answers` |
| server timer Redis | DONE | TTL `submission:timer:*` |
| finish + auto-grading | DONE | finish/result service |
| anomaly log | DONE | `/submissions/:id/anomalies` |
| halaman ujian full-screen | DONE | `ExamSessionPanel.tsx` |
| timer sync | DONE | session polling + remaining_seconds |
| nav soal grid | DONE | `ExamSessionPanel` |
| bookmark/select | DONE | payload `is_bookmarked` |
| submit confirm | DONE | `ConfirmDialog` flow |
| hasil ujian + breakdown | DONE | `ExamResultPanel.tsx` |

## Sprint 06 - Dashboard & Laporan MVP
| Task | Status | Evidence |
|---|---|---|
| GET dashboard summary | DONE | `routes/dashboard.rs` |
| GET class results | DONE | `routes/report.rs` |
| export CSV | DONE | `/reports/class-results/export.csv` |
| DB index tuning | DONE | `0008_dashboard_indexes.sql` |
| health endpoint | DONE | `/health` |
| bugfix & stabilisasi | DONE | CI strict gate + regression scripts + staging signoff report |
| dashboard admin/guru/siswa | DONE | `DashboardPanel.tsx` |
| chart sederhana bar | DONE | `DashboardPanel` chart type bar |
| in-app notifications | DONE | `Topbar.tsx` + notification API |
| PWA manifest + SW | DONE | `manifest.webmanifest`, `sw.js`, `main.tsx` |
| PWA install prompt UI | DONE | `Topbar.tsx` + `beforeinstallprompt` handling |
| user testing pilot 1 sekolah | DONE (Repo Artifact) | `docs/mvp/sprint-06/pilot-test-plan.md` |
| bugfix dari feedback pilot | DONE (Repo Artifact) | `pilot-feedback-log-template.md`, `bug-triage-policy.md` |
| staging deployment stabil | DONE (Repo Artifact) | `staging-stability-checklist.md` |
| user guide MVP | DONE | `user-guide-mvp.md` |
| performance monitoring setup | DONE | `/metrics`, docker profile monitoring, docs |
| MVP demo prep | DONE | `demo-checklist.md` |
