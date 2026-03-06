# XAMINA — MVP TO PRODUCTION EXECUTION PLAN (DETAILED)

**Durasi Total:** 32 Minggu
**Total Sprint:** 16 (2 minggu per sprint)
**Stack Utama:** Rust (Axum) + React (TS) + PostgreSQL + Redis

---

# 🌱 PHASE 1 — MVP (Sprint 1–6)

---

# 🟢 Sprint 01 — Project Setup & Auth

**Minggu 1–2**

## 🦀 Backend (Rust / Axum)

* Setup Rust workspace (api, core, db crate separation)
* Konfigurasi Axum + Tower middleware
* Setup PostgreSQL + SQLx migrations
* Struktur folder domain-driven (auth, user, exam, question)
* Implement JWT authentication:

  * Login
  * Refresh token
  * Logout
* Argon2 password hashing
* User model + Role enum
* Tenant model dasar (single-tenant first)
* Error handling global (AppError)
* Structured logging (tracing)

## ⚛️ Frontend (React + TS)

* Scaffold Vite + React + TypeScript
* Setup TanStack Router
* Setup TanStack Query
* Axios instance + auth interceptor
* Zustand auth store
* Login page (form + validation)
* Layout shell:

  * Sidebar
  * Topbar
  * Route guard
* Protected routes logic

## ⚙️ DevOps / QA

* Monorepo Git structure
* Docker Compose:

  * api
  * postgres
  * redis
* GitHub Actions:

  * cargo test
  * lint
  * build
* .env structure (dev/staging)
* Setup staging VPS
* Basic README & setup guide

---

# 🟢 Sprint 02 — User Management & Kelas

**Minggu 3–4**

## 🦀 Backend

* CRUD Users (admin/guru/siswa)
* CRUD Kelas
* CRUD Jurusan
* Role-based middleware guard
* CSV Import siswa (batch insert)
* Pagination generic helper
* Filtering API
* Unit test user service
* DB seed script

## ⚛️ Frontend

* Halaman Manajemen User

  * Tabel
  * Search
  * Pagination
* Form Tambah/Edit User
* Import CSV modal
* Manajemen Kelas UI
* Role badge component
* Toast notification system

## ⚙️ DevOps / QA

* Postman collection
* Integration test auth + user endpoints
* Load test batch insert CSV
* Review UX manajemen user

---

# 🟢 Sprint 03 — Bank Soal & Editor

**Minggu 5–6**

## 🦀 Backend

* CRUD Question:

  * Pilihan ganda
  * Benar/salah
  * Isian
* JSONB options column
* Search & filter:

  * Topic
  * Difficulty
* Bulk edit/delete
* File upload handler
* Integrasi MinIO (S3 compatible)
* Validation logic soal

## ⚛️ Frontend

* Halaman Bank Soal:

  * Grid/List toggle
* Rich Text Editor
* Upload gambar soal
* Filter sidebar
* Bulk select & action
* Preview modal
* Infinite scroll pagination

## ⚙️ DevOps / QA

* Setup MinIO local
* Upload test gambar
* Accessibility audit editor
* Test search performance

---

# 🟢 Sprint 04 — Buat Ujian & Penjadwalan

**Minggu 7–8**

## 🦀 Backend

* CRUD Exam
* exam_questions relational table
* Shuffle logic (soal & opsi)
* Status flow:

  * draft
  * published
  * archived
* Validation:

  * Minimum soal
  * Schedule conflict
* start_at & end_at scheduling
* Index optimization

## ⚛️ Frontend

* Multi-step exam wizard
* Drag & drop urutan soal
* Exam settings:

  * Timer
  * Shuffle
  * Passing grade
* Kalender scheduling
* Status badge workflow
* Preview sebelum publish

## ⚙️ DevOps / QA

* E2E flow:

  * Buat soal → publish
* Performance test wizard
* API documentation exam

---

# 🟢 Sprint 05 — Sesi Ujian Siswa

**Minggu 9–10**

## 🦀 Backend

* POST /exams/:id/start
* Submission model
* GET soal per sesi
* POST jawaban (JSONB answers)
* Redis server-side timer
* POST /finish → auto-grading
* Anti-cheat log:

  * tab switch
  * blur event

## ⚛️ Frontend

* Full-screen exam UI
* Timer countdown (sync tiap 30 detik)
* Navigasi soal grid
* Bookmark soal
* Submit confirmation modal
* Halaman hasil:

  * score
  * breakdown

## ⚙️ DevOps / QA

* Load test 100 concurrent siswa
* Timer sync accuracy test
* Responsive mobile test

---

# 🟢 Sprint 06 — Dashboard & Laporan MVP

**Minggu 11–12**

## 🦀 Backend

* GET dashboard stats per role
* Aggregasi nilai per kelas
* Export CSV nilai
* Health check endpoint
* Query index tuning
* Bug fix stabilisasi

## ⚛️ Frontend

* Dashboard Guru
* Dashboard Siswa
* Dashboard Admin
* Chart nilai (bar chart)
* Basic in-app notification
* Setup PWA

## ⚙️ DevOps

* User testing sekolah pilot
* Feedback fix
* Monitoring basic setup

---

# 🚀 PHASE 2 — BETA (Sprint 7–12)

---

# 🟡 Sprint 07 — Multi-Tenant Architecture

## 🦀 Backend

* PostgreSQL Row Level Security
* SET app.tenant_id middleware
* Tenant CRUD
* Quota enforcement
* Redis per tenant
* Data isolation audit

## ⚛️ Frontend

* SuperAdmin dashboard awal
* Tenant management UI
* Onboarding wizard sekolah
* Tenant switcher
* Quota indicator

## ⚙️ DevOps

* Security audit RLS
* Multi-tenant load test

---

# 🟡 Sprint 08 — WebSocket & Live Monitor

## 🦀 Backend

* WebSocket server
* Redis pub/sub room per exam
* Event system
* Anti-cheat lanjutan
* Heartbeat handling

## ⚛️ Frontend

* WebSocket client
* Monitor ujian live
* Real-time anomaly alert
* Force submit button

## ⚙️ DevOps

* WS load test
* Latency testing

---

# 🟡 Sprint 09 — AI Integration

## 🦀 Backend

* async-openai client
* AI generate question endpoint
* Essay grading endpoint
* PDF extraction
* AI credit tracking
* Ollama fallback

## ⚛️ Frontend

* AI Generator widget
* Upload PDF konteks
* Streaming response
* Review hasil AI
* Insert ke bank soal

## ⚙️ DevOps

* Rate limit testing
* Cost monitoring OpenAI

---

# 🟡 Sprint 10 — Sertifikat & Notifikasi

## 🦀 Backend

* PDF certificate generation
* Background worker
* Email SMTP integration
* In-app notification API

## ⚛️ Frontend

* Sertifikat preview
* Notification dropdown
* Push PWA
* Broadcast message

## ⚙️ DevOps

* SMTP production config
* PDF scale testing

---

# 🟡 Sprint 11 — Analitik Lanjutan

## 🦀 Backend

* Item analysis (P-value)
* Daya beda
* Distribusi nilai
* Time-series performa
* Export Excel

## ⚛️ Frontend

* Interactive charts
* Histogram nilai
* Insight table
* Export button

## ⚙️ DevOps

* Profiling query
* Data besar testing

---

# 🟡 Sprint 12 — Polish Beta & Import

## 🦀 Backend

* Import DOCX
* Import Excel
* Advanced rate limiting
* Compression middleware

## ⚛️ Frontend

* Import wizard
* Error handling import
* Onboarding tour
* Loading skeleton

## ⚙️ DevOps

* Beta launch 5–10 sekolah
* Performance profiling

---

# 🏁 PHASE 3 — PRODUCTION (Sprint 13–16)

---

# 🔵 Sprint 13 — Billing & Monetisasi

## 🦀 Backend

* Midtrans integration
* Subscription plan
* Invoice PDF
* Webhook handling
* Dunning logic

## ⚛️ Frontend

* Pricing page
* Checkout flow
* Billing history
* Upgrade/downgrade plan

## ⚙️ DevOps

* Sandbox testing
* Legal document finalisasi

---

# 🔵 Sprint 14 — SuperAdmin & Infra Production

## 🦀 Backend

* Cross-tenant analytics
* Global AI config
* Audit log lengkap

## ⚛️ Frontend

* SuperAdmin console
* Server health dashboard
* Audit log viewer

## ⚙️ DevOps

* Production server setup
* Nginx + SSL
* Backup otomatis
* Prometheus + Grafana

---

# 🔵 Sprint 15 — Security & Compliance

## 🦀 Backend

* OWASP audit
* Global rate limiting
* JWT rotation
* Suspicious detection
* Data export/delete

## ⚛️ Frontend

* CSP & security headers
* XSS audit
* Privacy settings
* 2FA optional

## ⚙️ DevOps

* Penetration test
* Dependency audit
* SSL A+ rating

---

# 🔵 Sprint 16 — Launch Preparation

## 🦀 Backend

* Production smoke test
* Query optimization final
* Redis tuning
* Load test 1000 concurrent
* Runbook SOP

## ⚛️ Frontend

* Landing page publik
* Help center
* Analytics setup
* Onboarding self-serve

## ⚙️ DevOps

* DNS & CDN (Cloudflare)
* Disaster recovery test
* Final monitoring tuning
* GO LIVE 🚀

---

# 🎯 Strategi Eksekusi

* 12 minggu pertama → Validasi produk
* 12 minggu berikutnya → Diferensiasi AI & SaaS
* 8 minggu terakhir → Monetisasi & hardening
* Setelah launch → Scale

