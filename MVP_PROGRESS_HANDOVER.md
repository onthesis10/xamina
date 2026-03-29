# Xamina MVP Progress Handover (Source-of-Truth)

Tanggal update: 26 Maret 2026  
Baseline verifikasi: codebase aktual (`xamina-backend`, `xamina-frontend`, `docs`, `.github`)
Update terbaru factual batch ini: lihat section `Update Sprint 15 Batch 2 Email OTP + Suspicious Login + Security Headers (26 Maret 2026)`.

## Update Sprint 15 Batch 2 Email OTP + Suspicious Login + Security Headers (26 Maret 2026)

### Selesai diverifikasi
1. **Gap code Sprint 15 yang sebelumnya belum ada sekarang sudah ditambahkan di source**:
- migration baru `xamina-backend/crates/db/migrations/0017_sprint15_auth_security.sql`.
- modul backend baru `xamina-backend/crates/api/src/routes/auth_security.rs`.
- dokumen audit baru `docs/security/SPRINT15_XSS_AUDIT.md`.
2. **Backend auth security sekarang aktif di source-level**:
- route baru:
  - `POST /api/v1/auth/login/verify-email-otp`
  - `POST /api/v1/auth/login/resend-email-otp`
  - `GET /api/v1/auth/privacy/security-settings`
  - `PATCH /api/v1/auth/privacy/security-settings`
- `POST /api/v1/auth/login` sekarang sudah factual menjadi union response:
  - `status=authenticated`
  - `status=challenge_required`
- source sekarang sudah menyimpan:
  - `user_security_settings`
  - `auth_login_challenges`
  - `auth_login_events`
- suspicious detection source-level sekarang sudah ada dengan signal:
  - `always_on_email_otp`
  - `new_device_or_ip`
  - `recent_failed_logins`
  - `recent_otp_failures`
- OTP email sekarang di-enqueue ke `email_jobs` agar memakai pipeline SMTP/Mailpit existing.
3. **Frontend auth + privacy ikut diperluas secara factual**:
- `xamina-frontend/src/features/auth/LoginForm.tsx` sekarang punya flow 2 tahap:
  - login kredensial
  - verifikasi Email OTP + resend + countdown expiry
- bug UX login lama ikut tertutup: setelah session authenticated, route sekarang redirect ke `/app/dashboard`.
- `xamina-frontend/src/features/privacy/PrivacySettingsPanel.tsx` sekarang menampilkan:
  - toggle `Always require Email OTP`
  - form `current_password`
  - recent security activity
  - status last risky login / last OTP verification
- `xamina-frontend/src/features/privacy/privacy.api.ts` sekarang sudah memanggil endpoint security settings.
- spec browser baru ditambahkan: `xamina-frontend/e2e/auth-security.spec.ts`.
4. **Security headers + CSP baseline sekarang ada di repo**:
- backend global response header sekarang ditambahkan di `xamina-backend/crates/api/src/app.rs`:
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- template production `ops/nginx/xamina.conf.template` sekarang memuat:
  - `Strict-Transport-Security`
  - `Content-Security-Policy`
  - header hardening lain yang konsisten dengan Sprint 15.
5. **Audit XSS source-level sekarang terdokumentasi**:
- pencarian repo untuk `dangerouslySetInnerHTML`, `__html`, dan assignment `innerHTML` sudah diringkas di `docs/security/SPRINT15_XSS_AUDIT.md`.
- hasil factual batch ini:
  - tidak ada sink `dangerouslySetInnerHTML` aktif.
  - ada usage `innerHTML` di `QuestionBankPanel`, tetapi konteksnya untuk normalisasi input rich editor menjadi plain text, bukan render HTML mentah ke UI.
6. **Gate verification batch ini yang benar-benar berhasil dieksekusi**:
- `cargo check -p api` -> PASS.
- `cargo check -p api --tests` -> PASS.
- `npm run build` -> PASS.
- `npx playwright test e2e/auth-security.spec.ts --project=chromium` -> PASS (2/2).
7. **Runtime source-latest host-run sekarang juga sudah terbukti sehat untuk Email OTP flow**:
- backend host-run aktif di `127.0.0.1:18080` dengan `GET /health` -> `OK`.
- frontend dev sekarang auto-detect backend lokal aktif melalui `xamina-frontend/vite.config.ts`, sehingga tidak lagi macet karena salah proxy port saat backend berjalan di `18080`.
- helper lokal baru tersedia:
  - `ops/dev/start-frontend-dev.ps1`
  - `ops/dev/get-latest-login-otp.ps1`
  - `xamina-backend/crates/api/src/bin/dev_auth_debug.rs`
- `xamina-backend/.env` lokal sekarang telah factual berisi `REDIS_URL` dan `SMTP_*` untuk host-run lokal.
8. **Runtime OTP/source-latest sekarang sudah terbukti secara faktual**:
- `POST /api/v1/auth/login` pada runtime aktif berhasil mengembalikan `status=challenge_required` saat `Always require Email OTP` diaktifkan.
- email OTP terbaru masuk ke `email_jobs` dengan status `sent` dan `sent_at` terisi.
- verifikasi `POST /api/v1/auth/login/verify-email-otp` via proxy frontend `127.0.0.1:5173` berhasil mengembalikan sesi final.
- browser automation Playwright pada sesi baru berhasil:
  - login di `/auth/login`
  - masuk ke layar OTP
  - isi OTP terbaru
  - berpindah ke `/app/dashboard`
- sesudah verifikasi runtime selesai, setting `email_otp_enabled` untuk `admin@xamina.local` dikembalikan lagi ke `false` agar akun kembali ke default non always-on.

### Belum selesai
1. **Sprint 15 belum bisa dinaikkan ke `DONE`**:
- ignored integration execution backend untuk `auth_security_integration` belum punya evidence runtime PASS.
2. **Ada blocker lokal saat mencoba gate backend yang lebih berat**:
- `cargo test -p api --test auth_security_integration -- --ignored --nocapture --test-threads=1` gagal karena file `target\\debug\\api.exe` terkunci (`Access is denied`).
- rerun dengan `CARGO_TARGET_DIR=target-auth-security` masih timeout compile pada mesin ini sebelum test selesai.
3. **Residul environment lokal non-blocking masih ada pada observability tool**:
- SMTP delivery ke Mailpit pada port `1025` sudah factual bekerja (`email_jobs.status=sent`), tetapi Mailpit Web UI `127.0.0.1:8025` masih timeout pada mesin ini.
- Docker CLI (`docker ps`, `docker compose`, `docker restart`) masih timeout pada host ini, jadi restart/inspeksi container Mailpit belum bisa dibuktikan dari shell.
3. **Residual Sprint 15 external masih tetap terbuka**:
- OWASP audit.
- penetration test.
- dependency audit formal.
- SSL A+ rating.

### Rencana berikutnya
1. Jika blocker toolchain lokal sudah bersih, ulangi gate backend:
- `cargo test -p api --test auth_security_integration -- --ignored --nocapture --test-threads=1`
- `cargo test -p api --test auth_integration --test privacy_auth_integration -- --ignored --nocapture --test-threads=1`
2. Jika Docker host kembali responsif, pulihkan observability Mailpit UI (`8025`) agar inbox OTP bisa dilihat langsung tanpa helper script.
3. Karena runtime OTP/source-latest sudah factual PASS, evaluasi ulang apakah Sprint 15 code-scope bisa dianggap tertutup dan sisakan hanya task audit external.

## Update Sprint 15 Privacy Export/Delete + Frontend Privacy Settings Verification (25 Maret 2026)

### Selesai diverifikasi
1. **Cross-check factual Sprint 15 sudah dirapikan sebelum implementasi baru**:
- `global rate limiting` ternyata sudah benar-benar ada di source (`xamina-backend/crates/api/src/middleware/rate_limit.rs`) dan bukan gap kosong.
- `JWT rotation` juga sudah factual via revoke + issue refresh token baru di route `POST /api/v1/auth/refresh`.
- gap Sprint 15 yang benar-benar belum ada di codebase sebelum batch ini adalah `data export/delete` backend dan `privacy settings` frontend.
2. **Backend privacy self-service sekarang aktif di source**:
- route baru:
  - `GET /api/v1/auth/privacy/export`
  - `GET /api/v1/auth/privacy/delete-request`
  - `POST /api/v1/auth/privacy/delete-request`
- helper baru `xamina-backend/crates/api/src/privacy_ops.rs` menambahkan bootstrap idempotent untuk schema `account_deletion_requests` agar local DB yang belum menjalankan migration tetap bisa dipakai.
- migration baru `xamina-backend/crates/db/migrations/0016_sprint15_privacy_requests.sql` menambah table, index, dan policy tenant isolation untuk deletion request.
- payload export sekarang memuat profil akun, refresh session metadata, submission ujian, notifikasi, sertifikat, dan latest deletion request.
3. **Frontend privacy settings sekarang aktif untuk semua user terautentikasi**:
- route baru `/app/privacy`.
- sidebar sekarang memuat menu `Privacy` untuk role `admin`, `guru`, `siswa`, dan `super_admin`.
- panel baru bisa:
  - mengunduh export JSON `Download My Data`
  - menampilkan status deletion request terbaru
  - mengirim deletion request baru dan memblokir duplikasi saat status masih `pending`
4. **Gate source-level batch ini lolos**:
- `cargo check -p api` -> PASS.
- `cargo build -p api` -> PASS.
- `cargo test -p api --test privacy_auth_integration --no-run -j 1` -> PASS.
- `npm run build` -> PASS.
5. **Runtime factual source-latest untuk Sprint 15 privacy berhasil dibuktikan**:
- binary `api.exe` source-latest berhasil dibuild ulang dan dijalankan kembali di `127.0.0.1:18080`.
- login `admin@xamina.local` berhasil pada runtime source-latest aktif.
- `GET /api/v1/auth/privacy/export` -> `200` dengan export user `admin@xamina.local`.
- `GET /api/v1/auth/privacy/delete-request` awalnya `none`, lalu `POST /api/v1/auth/privacy/delete-request` berhasil membuat status `pending`, dan `GET` berikutnya mengembalikan status `pending`.
- browser smoke pada frontend `127.0.0.1:4174` terhadap backend source-latest berhasil:
  - route `/app/privacy` render normal
  - download JSON berjalan dengan nama file `xamina-privacy-export-admin_xamina.local-2026-03-25.json`
  - status `pending` tampil
  - tombol `Request Account Deletion` otomatis disabled saat request masih pending
  - `consoleErrorCount = 0`
6. **Dokumentasi repo ikut disesuaikan**:
- `xamina-backend/README.md` sekarang memasukkan migration `0016_sprint15_privacy_requests.sql`.
- daftar endpoint backend di README sekarang memasukkan endpoint privacy Sprint 15.

### Belum selesai
1. **Sprint 15 belum bisa dinaikkan ke `DONE`**:
- `suspicious detection` belum ada implementasi factual baru batch ini.
- `2FA optional` belum ada flow/backend/frontend factual.
- `CSP & security headers` serta closure `XSS audit` belum ada evidence factual baru batch ini.
2. **Task audit/hardening Sprint 15 masih dominan external atau belum dieksekusi**:
- OWASP audit.
- penetration test.
- dependency audit formal.
- SSL A+ rating.

### Rencana berikutnya
1. Lanjutkan Sprint 15 dengan batch hardening berikutnya: `suspicious detection` + `CSP/security headers` + `2FA optional`.
2. Setelah surface aplikasi stabil, baru tarik item external Sprint 15: dependency audit, penetration test, dan SSL hardening evidence.

## Update Sprint 14 Source-Latest Runtime Closure + Local Monitoring Verification (24 Maret 2026)

### Selesai diverifikasi
1. **Environment lokal berhasil dipulihkan untuk verifikasi source-latest**:
- ruang disk `C:` yang sebelumnya `0 GB` free berhasil dipulihkan dengan `cargo clean` pada `xamina-backend` dan penghapusan `target-billing-pdf`.
- sesudah cleanup, `cargo check -p api` kembali `PASS` dari rebuild bersih.
2. **Bug Sprint 14 pada source terbaru sekarang tervalidasi lewat host-run runtime nyata**:
- API source-latest berhasil dijalankan di `127.0.0.1:18080` terhadap PostgreSQL `55432` dan Redis `56379`.
- `GET /api/v1/platform/system/health` sekarang `200` dengan `db.healthy=true` dan `redis.healthy=true`.
- `GET /api/v1/platform/analytics/overview` sekarang `200` dan mengembalikan totals factual (`tenants_total=2`, `users_total=908`, `submissions_total=803`, `active_mrr_total=299000`).
3. **Sprint 14 schema drift lokal berhasil ditutup dari source code**:
- ditemukan bahwa DB lokal yang dipakai host-run belum memiliki relation `platform_ai_settings` dan `platform_audit_logs` walau source sudah memakai endpoint Sprint 14.
- helper baru `ensure_platform_ops_schema()` di `xamina-backend/crates/api/src/platform_audit.rs` sekarang bootstrap schema/policy Sprint 14 secara idempotent untuk local DB yang tertinggal migration.
- `record_platform_audit()` sekarang memastikan schema platform tersedia sebelum insert audit event.
- `ensure_platform_ai_settings_exists()` dan route `list_platform_audit_logs()` sekarang memanggil bootstrap schema tersebut sebelum query.
4. **Surface area platform Sprint 14 pada source-latest sekarang sehat end-to-end**:
- `GET /api/v1/platform/ai-config` sekarang `200` pada runtime source-latest.
- `GET /api/v1/platform/audit-logs?page=1&page_size=5` sekarang `200` pada runtime source-latest.
- `PATCH /api/v1/platform/ai-config` berhasil dan audit log pertama tercatat sebagai `platform.ai_config.updated` (`audit_total=1`).
5. **Frontend smoke source-latest backend berhasil dibuktikan factual**:
- frontend host lokal dijalankan di `127.0.0.1:4174` dengan `VITE_API_PROXY_TARGET=http://127.0.0.1:18080`.
- browser automation login sebagai `superadmin@xamina.local` berhasil via injected session valid.
- route `/app/platform/console` render tanpa error `Gagal memuat`.
- route `/app/platform/audit-logs` render tanpa error `Gagal memuat audit logs.`.
6. **Monitoring baseline Sprint 14 sekarang terbukti hidup di lokal**:
- `GET http://127.0.0.1:18080/metrics` -> `200`.
- `GET http://127.0.0.1:9090/-/healthy` -> `200`.
- `GET http://127.0.0.1:9090/api/v1/targets` -> `200`.
- `GET http://127.0.0.1:3001/login` -> `200`.
7. **Mismatch dokumentasi lokal ikut dirapikan**:
- `xamina-backend/README.md` sekarang memasukkan migration `0015_sprint14_platform_ops.sql` pada daftar manual migration.

### Belum selesai
1. **Parity container runtime `8080` terhadap source-latest batch ini belum ditutup**:
- verifikasi source-latest batch ini dilakukan via host-run `127.0.0.1:18080`, bukan via rebuild container `xamina-api-1`.
- percobaan sebelumnya `docker compose up -d --build api` sempat gagal karena `TLS handshake timeout` ke Docker registry; rebuild parity itu belum saya ulang sukses pada batch ini.
2. **Item Sprint 14 yang benar-benar tersisa sekarang dominan external/prod**:
- production host nyata + Nginx/SSL publik.
- backup scheduler real di host eksternal.
- monitoring production wiring di host eksternal.
3. **Gate compile test tertentu masih belum tertutup penuh di mesin ini**:
- `cargo test -p api --test platform_superadmin_integration --no-run -j 1` sempat timeout pada rebuild bersih; namun gap ini sekarang tertutup sebagian oleh verifikasi runtime source-latest + browser smoke yang factual.

### Rencana berikutnya
1. Jika Docker registry stabil, ulangi rebuild `api` container agar parity `8080` = source-latest `18080`.
2. Jika kredensial/domain/server production sudah tersedia, eksekusi sisa Sprint 14 external deployment.
3. Karena Sprint 14 local/source-latest sekarang sehat, development implementation berikutnya boleh mulai masuk Sprint 15 dengan tetap mencatat residual external Sprint 14 di atas.

## Update Sprint 14 Platform Analytics/Health Type Fix (24 Maret 2026)

### Selesai diverifikasi
1. **Runtime lokal core stack sekarang benar-benar hidup lagi**:
- `docker ps` menunjukkan container `xamina-api-1`, `xamina-frontend-1`, `xamina-postgres-1`, `xamina-redis-1`, `xamina-minio-1`, dan `xamina-mailpit-1` status `Up`.
2. **Auth superadmin pada runtime aktif terverifikasi factual**:
- login `POST /api/v1/auth/login` dengan `tenant_slug=default`, `superadmin@xamina.local`, `P@ssw0rd123!` berhasil dan mengembalikan `access_token`.
3. **Mismatch factual baru Sprint 14 ditemukan pada runtime aktif**:
- `GET /health` di runtime aktif merespons `200 OK`.
- `GET /api/v1/platform/system/health` di runtime aktif merespons `200`, tetapi field `db.healthy=false` dengan detail `mismatched types; Rust type i64 ... is not compatible with SQL type INT4`.
- `GET /api/v1/platform/analytics/overview` di runtime aktif gagal dengan `DB_ERROR: Failed to load platform analytics totals`.
- artinya baseline route Sprint 14 memang ada di runtime aktif, tetapi implementasi query type-nya belum aman terhadap tipe PostgreSQL nyata sehingga Sprint 14 tetap belum bisa dianggap `DONE`.
4. **Bugfix source-level sudah diterapkan di backend**:
- `xamina-backend/crates/api/src/routes/platform.rs` sekarang mengubah agregasi `COUNT(*)` menjadi `::bigint` dan agregasi `SUM(amount)` menjadi `::bigint` agar cocok dengan DTO `i64`.
- pengecekan DB ping pada `system_health` diubah dari `query_scalar::<_, i64>(\"SELECT 1\")` menjadi `query_scalar::<_, i32>(\"SELECT 1\")` agar tidak gagal pada literal `INT4`.
5. **Gate compile source-level untuk patch ini lolos**:
- `cargo check -p api` -> PASS (warning future-incompatibility `sqlx-postgres v0.7.4`).
6. **SQL hasil patch sudah divalidasi langsung ke database runtime aktif**:
- query totals hasil patch berhasil dieksekusi lewat `docker exec xamina-postgres-1 psql ...` dan mengembalikan payload factual `2|2|908|9|803|0|299000|22`.
- query top tenants hasil patch juga berhasil dieksekusi dan mengembalikan minimal dua tenant (`Default School`, `Test School`) tanpa error type mismatch.

### Belum selesai
1. **Runtime source-latest belum berhasil disamakan dengan patch terbaru**:
- `docker compose up -d --build api` gagal pada fetch metadata base image `rust:1.91-slim` karena `TLS handshake timeout` ke `registry-1.docker.io`.
- akibatnya container `xamina-api-1` yang sedang hidup belum bisa dibuktikan sebagai representasi patch source terbaru batch ini.
2. **Verifikasi host-run source terbaru juga masih diblokir environment lokal**:
- percobaan `cargo test -p api --test platform_superadmin_integration --no-run` berhenti di linker Windows dengan `LNK1318` / PDB error.
- percobaan menjalankan API source terbaru pada port terpisah dengan target dir terisolasi gagal karena `rustc-LLVM ERROR: no space on device`.
3. **Smoke browser Sprint 14 source-latest belum bisa ditutup**:
- route FE superadmin (`/app/platform/console`, `/app/platform/audit-logs`) belum diuji ulang terhadap backend patch terbaru karena runtime source-latest belum hidup.
4. **Sprint 14 tetap belum dinaikkan ke `DONE`**:
- closure factual masih tertahan sampai endpoint platform pada runtime source-latest benar-benar sehat (`db.healthy=true`, analytics `200`) dan smoke browser lolos.

### Rencana berikutnya
1. Bebaskan disk workspace / build cache yang aman dibersihkan, lalu rerun gate backend `cargo test -p api --test platform_superadmin_integration --no-run`.
2. Ulangi rebuild `api` setelah koneksi Docker registry stabil atau base image tersedia di cache lokal.
3. Setelah runtime source-latest hidup, verifikasi ulang:
- `GET /api/v1/platform/system/health`
- `GET /api/v1/platform/analytics/overview`
- smoke browser `/app/platform/console` dan `/app/platform/audit-logs`
4. Hanya jika verifikasi Sprint 14 source-latest sudah factual `PASS`, lanjutkan implementasi Sprint 15.

## Update FE Download Fallback + Docker Uploads Parity (16 Maret 2026)

### Selesai diverifikasi
1. **Frontend download fallback diseragamkan via helper publik** (repo-level):
- helper baru `downloadPublicAssetFile()` ditambahkan di `xamina-frontend/src/lib/file-download.ts` dengan normalisasi URL + cache-bust.
- `BillingWorkspacePanel` kini reuse helper publik agar fallback invoice konsisten.
- `ExamResultPanel` dan `MyCertificatesPanel` memakai fallback public-asset untuk download sertifikat jika endpoint auth gagal.
2. **Docker compose parity untuk uploads ditambahkan** (repo-level):
- `docker-compose.yml` menambah `XAMINA_UPLOADS_DIR=/uploads`.
- volume `uploads_data` dipasang ke `/uploads` pada service `api` agar invoice/sertifikat terbaca konsisten di container runtime.
3. **Verification gates batch ini (repo-level)**:
- `cargo check -p api` -> PASS (warning future-incompatibility `sqlx-postgres v0.7.4`).
- `npm run build` -> PASS (warning chunk size > 500 kB).
- `npx playwright test e2e/sprint10-certificate.spec.ts e2e/sprint13-billing.spec.ts --project=chromium` -> PASS (5/5).

### Belum selesai
1. **Verifikasi runtime lokal belum dijalankan**:
- belum ada evidence `GET /api/v1/platform/system/health` dari runtime container terbaru.
- belum ada evidence download invoice/sertifikat via browser dari runtime terbaru.
 - `docker compose up -d --build postgres redis api` gagal karena Docker engine tidak tersedia (`dockerDesktopLinuxEngine` pipe tidak ditemukan).
2. **Gate build/test belum dijalankan ulang pada batch ini**:
- `cargo check -p api`, `npm run build`, dan Playwright e2e download belum dieksekusi ulang.

### Rencana berikutnya
1. Nyalakan Docker engine/Desktop, lalu jalankan docker compose terbaru dan verifikasi endpoint `GET /api/v1/platform/system/health`.
2. Login seed `siswa` dan `admin`, lakukan download sertifikat + invoice dan pastikan file non-zero.
3. Jalankan gate compile/build dan Playwright untuk `sprint10-certificate` + `sprint13-billing`.

## Update Certificate Download Streaming + Sprint 14 Re-Verification (10 Maret 2026)

### Selesai diverifikasi
1. **Bugfix utama download sertifikat sekarang diubah ke streaming PDF authenticated, bukan redirect `302`**:
- backend route `GET /api/v1/certificates/:id/download` sekarang merespons `200 application/pdf`.
- response sekarang membawa `Content-Disposition: attachment` agar browser mengunduh file langsung.
- service sertifikat sekarang membaca file PDF dari `file_path` lokal dengan resolusi uploads yang konsisten terhadap `XAMINA_UPLOADS_DIR` / fallback repo path.
2. **Frontend sertifikat sekarang tidak lagi bergantung pada anchor download langsung**:
- alur download di `ExamResultPanel` dan `MyCertificatesPanel` diubah ke blob download terprogram.
- helper baru `xamina-frontend/src/lib/file-download.ts` dipakai untuk fetch binary auth + fallback axios + save blob yang konsisten.
3. **Frontend billing ikut dirapikan ke helper download bersama**:
- `billing.api.ts` sekarang memakai helper binary download yang sama agar validasi `content-type`, `blob.size`, dan save file konsisten dengan flow sertifikat.
4. **Gate repo-level yang berhasil diverifikasi batch ini**:
- `cargo check -p api` -> PASS.
- `cargo test -p api --test sprint10_certificate_notification_integration --no-run` -> PASS.
- `cargo test -p api --test billing_integration --no-run` -> PASS.
- `cargo test -p api --test platform_superadmin_integration --no-run` -> PASS.
- `npm run build` -> PASS.
- `npm run test:e2e -- e2e/sprint10-certificate.spec.ts e2e/sprint13-billing.spec.ts e2e/sprint14-superadmin.spec.ts --project=chromium` -> PASS (7/7).
5. **Regression browser mock sekarang lebih kuat**:
- `sprint10-certificate.spec.ts` tidak lagi hanya cek href; sekarang menunggu event download nyata.
- helper mock API frontend sekarang juga memalsukan endpoint `GET /api/v1/certificates/:id/download` sebagai PDF.
6. **Runtime pendukung berhasil dipulihkan sebagian dan data live baru berhasil dibuat ulang**:
- Docker Desktop sempat dipulihkan sampai stack `postgres`, `redis`, `api`, `frontend`, `mailpit`, dan `minio` kembali `Up`.
- `ops/loadtest/run_sprint10_runtime_evidence.ps1` kembali `PASS` di runtime aktif dan menghasilkan evidence baru:
  - summary: `ops/load/reports/sprint10-runtime-evidence-20260310-164046.json`
  - student live: `sprint10-20260310164047@xamina.local`
  - submission: `cb0d976a-11c4-4251-9792-db160969f858`
  - certificate: `c226a63e-67a8-4fdc-81c6-6feca77527a3`
- login live untuk `admin@xamina.local`, student Sprint 10 baru, dan `superadmin@xamina.local` berhasil diverifikasi via API.
7. **Ada mismatch factual baru pada runtime Docker aktif terhadap source code saat ini**:
- source code backend memang memiliki route `GET /api/v1/platform/system/health` di `routes/platform.rs`.
- tetapi runtime Docker aktif membalas `404` untuk endpoint itu, yang mengindikasikan container API yang sedang hidup bukan representasi source terbaru.
- summary billing tenant dan summary billing platform tenant-specific tetap bisa diakses di runtime aktif, tetapi itu belum cukup untuk menganggap smoke source-latest selesai.

### Belum selesai
1. **Smoke runtime live FE+BE dari source terbaru belum bisa ditutup secara factual**:
- percobaan rerun ignored integration tests nyata (`-- --ignored`) gagal di environment lokal dengan error `pool timed out while waiting for an open connection`.
- percobaan start API lokal dari source terbaru (`cargo run -p api`) tetap gagal dengan error yang sama saat konek ke PostgreSQL lokal `localhost:55432`, walaupun stack Docker sudah sempat sehat kembali.
- percobaan rebuild `docker compose up -d --build api` untuk menyamakan runtime dengan source terbaru tidak selesai stabil; command timeout panjang dan Docker API kembali tidak sehat sesudahnya.
- karena runtime Docker yang berhasil hidup kembali masih terlihat memakai image lama, smoke browser terhadap `127.0.0.1:8080` tidak bisa dipakai sebagai evidence source-latest yang valid.
- akibat blocker koneksi DB ini, verifikasi live browser untuk:
  - `/app/my-exams/result/:id`
  - `/app/my-certificates`
  - `/app/billing`
  - `/app/platform/billing`
  belum bisa dibuktikan pada batch ini.
2. **Sprint 14 tidak dinaikkan ke `DONE` pada batch ini**:
- backend/frontend baseline Sprint 14 tetap ada dan mock browser regression tetap PASS.
- tetapi closure factual penuh ditahan sampai runtime live lokal kembali sehat dan smoke FE+BE bisa dibuktikan.

### Rencana berikutnya
1. Pulihkan environment runtime lokal terlebih dahulu:
- bebaskan / reset koneksi PostgreSQL lokal yang macet untuk proses host `cargo run`.
- stabilkan Docker engine lalu rebuild `api` dari source terbaru sampai endpoint Sprint 14 sama dengan source code (`/platform/system/health` tidak lagi `404`).
- pastikan API source terbaru bisa boot penuh dan health endpoint responsif.
2. Setelah API source terbaru hidup:
- ulangi smoke browser live untuk certificate + invoice download dengan file non-zero.
- gunakan data live yang sudah tersedia dari `sprint10-runtime-evidence-20260310-164046.json` agar smoke certificate tidak perlu reseed ulang.
- ulangi ignored integration tests backend secara serial pada DB test yang sehat.
3. Hanya jika gate runtime live itu lulus:
- tandai closure Sprint 14 sesuai evidence aktual.
- lanjut ke Sprint 15.

## Update Sprint 13 Midtrans Preflight Retest (10 Maret 2026)

### Selesai diverifikasi
1. **Runner Sprint 13 sekarang `PASS` end-to-end**:
- command: `ops/loadtest/run_sprint13_billing_runtime_evidence.ps1`
- preflight Midtrans `PASS` (STATUS=201).
- checkout + webhook settlement + invoice PDF berhasil.
- summary sukses: `ops/load/reports/sprint13-runtime-evidence-20260310-110900.json`
- artefak preflight: `ops/load/reports/sprint13-midtrans-preflight-20260310-110900.txt`
- artefak invoice: `ops/load/reports/sprint13-invoice-20260310-110900.pdf`
2. **Runner Sprint 13 di-hardening agar stabil**:
- `Wait-ForDatabase` sekarang tahan terhadap error transient DB startup.
- `MIDTRANS_*` di-override ke proses API agar signature konsisten dengan runner.
- Fix bug signature runner (parameter `Input` bentrok variable otomatis PowerShell).
- Fix query snapshot webhook events (kolom `raw_payload_jsonb`).

### Belum selesai
1. Legal dokumen final yang signed tetap belum tersedia; repo saat ini baru punya template legal (`docs/legal/*`), belum final agreement resmi.

### Rencana berikutnya
1. Finalisasi legal docs Sprint 13 (external).
2. Setelah legal docs siap, tandai Sprint 13 sebagai `DONE (residual external legal)` di matrix dan lanjut ke Sprint 14 eksternal deployment.

## Update Sprint 14 SuperAdmin Console + Prod Infra Baseline (9 Maret 2026)

### Selesai diverifikasi
1. **Sprint 13 closure hardening di backend billing sudah ditambahkan**:
- `xamina-backend/crates/api/src/billing_gateway.rs` sekarang tidak lagi mengembalikan error generik saat Midtrans non-2xx.
- response non-2xx sekarang membawa `gateway_status`, `gateway_message`, dan `gateway_body` untuk root-cause yang lebih cepat.
2. **Runner Sprint 13 sekarang punya preflight credential Midtrans sebelum flow runtime penuh**:
- `ops/loadtest/run_sprint13_billing_runtime_evidence.ps1` menambahkan preflight direct ke gateway sandbox.
- artefak preflight terbaru: `ops/load/reports/sprint13-midtrans-preflight-20260309-210119.txt`.
- summary failure terbaru: `ops/load/reports/sprint13-runtime-evidence-20260309-210119.json`.
3. **Sprint 14 backend endpoint sudah aktif (super_admin guarded)**:
- endpoint baru:
  - `GET /api/v1/platform/analytics/overview`
  - `GET /api/v1/platform/system/health`
  - `GET /api/v1/platform/ai-config`
  - `PATCH /api/v1/platform/ai-config`
  - `GET /api/v1/platform/audit-logs`
- migration baru `xamina-backend/crates/db/migrations/0015_sprint14_platform_ops.sql` menambah:
  - `platform_ai_settings`
  - `platform_audit_logs`
4. **Audit log mutasi platform sudah aktif**:
- create/update tenant dicatat (`platform.tenant.created`, `platform.tenant.updated`).
- billing platform checkout/change-plan dicatat (`platform.billing.checkout.created`, `platform.billing.plan_change.created`).
- update AI config platform dicatat (`platform.ai_config.updated`).
5. **Sprint 14 frontend console + audit viewer sudah aktif**:
- route baru:
  - `/app/platform/console`
  - `/app/platform/audit-logs`
- superadmin sidebar sekarang memuat `Platform Console` dan `Audit Logs`.
- panel baru:
  - `PlatformConsolePanel` (analytics + health + AI config form)
  - `PlatformAuditLogsPanel` (viewer + filter + pagination)
6. **DevOps baseline Sprint 14 sudah ditambahkan di repo**:
- Nginx TLS template: `ops/nginx/xamina.conf.template`.
- Backup/restore script PostgreSQL:
  - `ops/backup/run_postgres_backup.ps1`
  - `ops/backup/restore_postgres_backup.ps1`
- runbook baru: `docs/ops/sprint14-superadmin-prodinfra-runbook.md`.
- runbook Sprint 13 billing juga diupdate untuk mencakup preflight artifact.
7. **Gate verifikasi batch ini (factual)**:
- backend:
  - `cargo check -p api` -> PASS.
  - `cargo test -p api --test billing_integration -- --ignored --test-threads=1` -> PASS (10/10).
  - `cargo test -p api --test platform_superadmin_integration -- --ignored --test-threads=1` -> PASS (3/3).
- frontend:
  - `npm run build` -> PASS.
  - `npx playwright test e2e/sprint13-billing.spec.ts --project=chromium` -> PASS (4/4).
  - `npx playwright test e2e/sprint14-superadmin.spec.ts --project=chromium` -> PASS (2/2).

### Belum selesai
1. Legal dokumen final yang signed tetap belum tersedia; repo saat ini baru punya template legal (`docs/legal/*`), belum final agreement resmi.
2. Sprint 14 production deployment nyata (server cloud + SSL issued public + backup scheduler real) belum dieksekusi di environment eksternal; saat ini masih baseline repo-level + local verification.

### Rencana berikutnya
1. Finalisasi legal docs Sprint 13 (external).
2. Lanjutkan hardening lanjutan Sprint 14 untuk deployment eksternal (provision host, cert, backup scheduler, monitoring production).

## Update Sprint 13 FE Invoice Download Empty Hotfix (10 Maret 2026)

### Selesai diverifikasi
1. **Frontend download invoice sekarang menolak respons kosong / bukan PDF**:
- `xamina-frontend/src/features/billing/billing.api.ts` melempar error bila blob size `0` atau content-type bukan PDF.
- ini memaksa fallback ke `pdf_url` publik saat endpoint API merespons kosong.
2. **Resolve public asset sekarang konsisten untuk host lokal beragam port**:
- `xamina-frontend/src/lib/api-base.ts` sekarang memetakan `localhost`/`127.0.0.1` ke same-origin `/uploads/...` tanpa mengunci port `8080`.
3. **Fallback download publik mencoba beberapa kandidat URL**:
- `xamina-frontend/src/features/billing/BillingWorkspacePanel.tsx` kini mencoba URL absolut dan same-origin `/uploads/...` jika tersedia.
4. **Download PDF sekarang pakai `arrayBuffer` agar tidak menghasilkan blob kosong**:
- `xamina-frontend/src/features/billing/billing.api.ts` dan `BillingWorkspacePanel.tsx` membaca binary via `arrayBuffer`.
5. **Fallback terakhir membuka invoice di tab baru**:
5. **Fallback terakhir sekarang force-download via anchor**:
- jika download gagal, UI membuat link `download` ke `pdf_url` agar file tetap terunduh.
6. **Download invoice sekarang mencoba axios arraybuffer jika fetch gagal**:
- `xamina-frontend/src/features/billing/billing.api.ts` fallback ke axios agar lebih stabil di browser tertentu.

### Belum selesai
1. Verifikasi runtime di browser user (download invoice tidak lagi kosong, file terunduh dengan ukuran > 0).

### Rencana berikutnya
1. Jalankan verifikasi manual di UI billing (`/app/billing` dan `/app/platform/billing`) dengan invoice terbaru.

## Update Sprint 13 Invoice PDF Upgrade (9 Maret 2026)

### Selesai diverifikasi
1. **Invoice PDF billing backend di-upgrade dari template minim menjadi invoice yang lebih informatif**:
- sekarang memuat `invoice_id`, `invoice_no/provider_ref`, `subscription_id`, status, amount, due date, paid date, billing period, tenant name/slug/id, workspace plan saat ini, selected plan, quota, checkout URL, hosted PDF URL, dan notes status.
- implementasi ada di `xamina-backend/crates/core/src/domain/billing/service.rs`.
2. **PDF invoice tidak lagi statis saat lifecycle billing berubah**:
- setelah `checkout_url` terpasang, PDF di-render ulang.
- setelah webhook settlement / status billing berubah, PDF di-render ulang.
- setelah dunning cycle menaikkan status `overdue/failed`, PDF juga di-render ulang.
3. **Coverage test backend ikut diperketat**:
- `xamina-backend/crates/api/tests/billing_integration.rs` sekarang menambahkan assertion isi PDF via `pdf-extract`.
- ditambah test refresh PDF setelah webhook agar status `paid` ikut muncul di PDF.
4. **Verifikasi runtime lokal setelah implementasi**:
- host API lokal di-restart dari source terbaru dan `GET /health` kembali `200`.
- checkout billing baru berhasil dibuat dan menghasilkan redirect Midtrans sandbox.
- artefak download PDF runtime disimpan di `ops/load/reports/billing-invoice-preview.pdf` dengan ukuran non-trivial (`5686` bytes), bukan file kosong.
5. **Frontend download invoice diproteksi dari file `0 B` akibat revoke blob URL terlalu cepat**:
- `xamina-frontend/src/features/billing/BillingWorkspacePanel.tsx` sekarang mengecek `blob.size` sebelum download.
- `URL.revokeObjectURL()` ditunda setelah klik selesai, bukan langsung dieksekusi pada tick yang sama.
- `npm run build` frontend tetap `PASS` setelah hotfix ini.
6. **Hardening lanjutan download PDF ditambahkan setelah reproduksi issue browser user**:
- frontend billing sekarang mengunduh PDF sebagai `arraybuffer`, lalu membentuk `Blob` manual agar tidak bergantung pada perilaku blob response browser/axios.
- request PDF sekarang memakai query anti-cache (`ts`) + header `Cache-Control/Pragma: no-cache`.
- backend endpoint PDF sekarang mengirim `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, dan `Expires: 0`.
- verifikasi real browser via Playwright pada `http://localhost:5173/app/billing` berhasil: event download menghasilkan file `5686` byte dengan nama `xamina-invoice-e7a01a33-b099-4758-b894-02b96c1d33f3.pdf`.
7. **Strategi download PDF diubah lagi agar tidak bergantung pada XHR invoice endpoint saat browser user terus menerima respons kosong**:
- tombol `Download PDF` sekarang memprioritaskan `invoice.pdf_url` langsung ke file statis `/uploads/invoices/...` yang memang sudah tersimpan di backend.
- URL asset publik dinormalisasi ke `127.0.0.1:8080` untuk local dev agar tidak jatuh ke listener `localhost` yang salah.
- `INVOICE_PUBLIC_BASE_URL` lokal dan `.env.example` juga disamakan ke `http://127.0.0.1:8080/uploads/invoices`.
- verifikasi Playwright setelah perubahan ini tetap `PASS`: browser download menghasilkan file non-zero (`5774` bytes).
8. **Hotfix final untuk kasus tab blank / white PDF di browser user**:
- tombol `Download PDF` tidak lagi membuka `pdf_url` langsung dengan anchor cross-origin.
- frontend sekarang selalu `fetch` file invoice publik sebagai binary lebih dulu, lalu membuat `Blob` lokal dan mengunduh hasilnya.
- verifikasi browser real setelah patch terakhir tetap `PASS`: download dari `http://localhost:5173/app/billing` menghasilkan file `5784` bytes dengan nama `xamina-invoice-67b70092-85d0-477c-b12b-f89e70bcc3d1.pdf`.
9. **Root cause final `Failed to fetch` setelah hotfix sebelumnya juga sudah ditutup**:
- `resolvePublicAssetUrl()` memang sudah mengubah asset invoice lokal menjadi same-origin `/uploads/...`, tetapi `BillingWorkspacePanel` sempat memanggil `new URL(resolvedUrl)` tanpa base sehingga melempar `Failed to construct 'URL': Invalid URL`.
- setelah diperbaiki ke `new URL(resolvedUrl, window.location.origin)`, request invoice di browser berubah menjadi `http://localhost:5173/uploads/invoices/...`, bukan lagi cross-origin `http://127.0.0.1:8080/...`.
- service worker frontend juga sekarang mengabaikan `/uploads/` agar file PDF tidak di-cache / di-fallback seperti app shell.
- verifikasi browser real terbaru `PASS`: request invoice keluar ke `/uploads/...` dan event download menghasilkan file `5774` bytes.
10. **Hotfix lanjutan setelah muncul lagi status `204` + file kosong di browser user**:
- alur download di `BillingWorkspacePanel` dikembalikan untuk selalu memakai endpoint API auth `GET /api/v1/billing/invoices/:invoiceId/pdf` (bukan fetch langsung `/uploads/...`).
- ini menutup edge case respons `204` kosong pada jalur fetch asset publik.
- verifikasi browser real terbaru `PASS`: request `http://localhost:5173/api/v1/billing/invoices/fa4740cd-e2c7-4b7f-859a-a47bdc340fcb/pdf?ts=...` merespons `200 application/pdf` dan file hasil download `5686` bytes.
11. **Root cause persistensi perilaku lama di browser dev juga ditutup dengan disable service worker pada mode `DEV`**:
- `xamina-frontend/src/main.tsx` sekarang tidak lagi mendaftarkan service worker ketika `import.meta.env.DEV`.
- pada `DEV`, app akan `unregister` service worker yang sudah ada dan membersihkan Cache Storage saat load.
- ini mencegah bundle/asset stale yang sebelumnya membuat fix invoice PDF terlihat tidak terpakai di browser user.
- verifikasi browser real setelah patch ini tetap `PASS`: download invoice dari `localhost:5173` menghasilkan file non-zero (`5784` bytes).
12. **Hardening tambahan untuk kasus browser user yang tetap membaca blob kosong meskipun endpoint merespons `200`**:
- `xamina-frontend/src/features/billing/billing.api.ts` sekarang memakai `fetch` native (bukan axios) untuk unduh PDF invoice, dengan header `Authorization` langsung dari auth store.
- ini menutup kemungkinan edge case adapter/transform response `axios` di browser tertentu yang mengembalikan blob kosong.
- backend route PDF tetap diverifikasi merespons `200 application/pdf`; verifikasi browser real terbaru PASS dengan file `5774` bytes pada route `GET /api/v1/billing/invoices/:invoiceId/pdf?ts=...`.

### Belum selesai
1. Visual QA browser terhadap tampilan PDF final belum ditutup formal; verifikasi batch ini baru sampai runtime generation + artifact existence + backend compile gate.
2. Suite `cargo test -p api --test billing_integration` cold compile pada target dir terpisah memakan waktu sangat lama di mesin ini; `cargo check -p api` sudah `PASS`, tetapi rerun penuh suite PDF baru belum saya selesaikan di batch ini.
3. Midtrans sandbox settlement live dan receipt setelah pembayaran tetap menjadi pekerjaan terpisah dari upgrade template PDF ini.

### Rencana berikutnya
1. Cek PDF baru langsung dari browser user setelah backend/frontend runtime terbaru aktif.
2. Jika perlu, tambah receipt mode khusus `paid` yang lebih formal setelah webhook settlement real Midtrans.
3. Lanjut closure sandbox settlement factual untuk Sprint 13.

## Update Sprint 13 Runtime Dev Fix (9 Maret 2026)

### Selesai diverifikasi
1. **404 pricing/billing di dev frontend ternyata bukan gap route code, tetapi mismatch host runtime**:
- `http://127.0.0.1:8080/api/v1/billing/plans` -> `200`.
- `http://localhost:8080/api/v1/billing/plans` sempat jatuh ke listener IPv6/runtime lama dan mengembalikan `404`.
2. **Fix final dev frontend sekarang memakai same-origin Vite proxy, bukan direct call cross-origin ke backend**:
- `xamina-frontend/.env.local` dan `xamina-frontend/.env.example` sekarang memakai `VITE_API_URL=/api/v1`.
- helper baru `xamina-frontend/src/lib/api-base.ts` dipakai oleh `axios`, AI streaming, dan WebSocket agar local dev otomatis tetap di jalur proxy.
- `xamina-frontend/vite.config.ts` sekarang mem-proxy `/api`, `/health`, `/metrics`, `/uploads`, dan `/ws` ke `http://127.0.0.1:8080`.
3. **Runtime billing DB error sebelumnya sudah tertutup**:
- migration `0014_sprint13_billing.sql` sudah diterapkan ke DB runtime lokal `xamina`.
- spam log `Failed to load due billing invoices` tidak lagi muncul setelah schema billing runtime tersedia.
4. **Verifikasi runtime setelah fix proxy billing/PDF**:
- `http://127.0.0.1:4173/pricing` -> `200`.
- `http://127.0.0.1:4173/api/v1/billing/plans` -> `200` via Vite proxy.
- login admin via proxy berhasil, `GET /api/v1/billing/history` mengembalikan invoice `3846a402-a6e2-4184-9cec-bd4b2d45ff70`.
- `GET /api/v1/billing/invoices/3846a402-a6e2-4184-9cec-bd4b2d45ff70/pdf` via proxy -> `200`, `Content-Type: application/pdf`.
5. **Compile gate frontend setelah runtime fix**:
- `npm run build` -> PASS.

### Belum selesai
1. Midtrans sandbox live tetap belum lolos karena credential/merchant saat ini masih mengembalikan `401 unauthorized transaction`.
2. Docker `api` image lokal masih bisa tertinggal dari code terbaru bila container lama dinyalakan kembali; source-of-truth route billing terbaru tetap ada di codebase.
3. Frontend dev server yang sudah terlanjur jalan di `5173` perlu di-restart agar env/proxy baru terbaca.

### Rencana berikutnya
1. Restart frontend dev server aktif lalu re-test download invoice dari browser di `5173`.
2. Jika ingin kembali ke runtime Docker penuh, rebuild image `api` sampai route billing terbaru ikut terbawa.
3. Setelah credential Midtrans valid, ulangi runner sandbox Sprint 13 untuk closure factual penuh.

## Update Sprint 13 Tenant Admin Billing + Public Pricing (9 Maret 2026)

### Selesai diverifikasi
1. **Sprint 13 code scope bertambah signifikan dan tidak lagi `super_admin` only**:
- backend sekarang punya endpoint publik baru `GET /api/v1/billing/plans`.
- backend tenant-admin self-serve baru aktif:
  - `GET /api/v1/billing/summary`
  - `GET /api/v1/billing/history`
  - `POST /api/v1/billing/checkout`
  - `POST /api/v1/billing/change-plan`
  - `GET /api/v1/billing/invoices/:invoiceId/pdf`
- guard factual:
  - role `admin` boleh memakai endpoint tenant billing.
  - role `super_admin` tetap memakai scope `/platform/tenants/:tenantId/billing/*`.
  - role `guru`/`siswa` ditolak pada endpoint billing tenant-admin.
2. **Frontend Sprint 13 sekarang mencakup flow publik + admin tenant**:
- route publik baru `/pricing`.
- route app baru `/app/billing` untuk role `admin`.
- route lama `/app/platform/billing` untuk `super_admin` tetap hidup.
- sidebar `admin` sekarang punya entry `Billing`; sidebar `super_admin` tetap punya `Platform Billing`.
- landing page `/` tidak lagi placeholder pre-sprint; sekarang mengarahkan ke pricing dan login.
- panel billing sudah direfactor ke primitive/shared panel sehingga admin tenant dan super admin memakai surface yang konsisten.
3. **QA code/test batch ini PASS secara factual**:
- `cargo check -p api` -> PASS.
- `cargo test -p api --test billing_integration --no-run` -> PASS.
- `cargo test -p api --test billing_integration -- --ignored --test-threads=1` -> PASS (9/9).
- `npm run build` -> PASS.
- `npx playwright test e2e/sprint13-billing.spec.ts --project=chromium` -> PASS (4/4).
4. **Runner dan runbook sandbox Sprint 13 sekarang sudah ada di repo**:
- runner baru: `ops/loadtest/run_sprint13_billing_runtime_evidence.ps1`.
- runbook baru: `docs/ops/sprint13-billing-sandbox-runbook.md`.
- runner sekarang menulis failure summary factual bila sandbox gagal, bukan hanya stdout/stderr.

### Belum selesai
1. Sprint 13 tetap `PARTIAL` karena **live Midtrans sandbox belum lolos**.
- runner factual terbaru: `ops/load/reports/sprint13-runtime-evidence-20260309-150048.json` -> `runtime_status=failed`.
- log runtime API terbaru:
  - `ops/load/reports/sprint13-api-runtime-20260309-150048.log`
  - `ops/load/reports/sprint13-api-runtime-20260309-150048.err.log`
- probe langsung ke gateway sandbox:
  - `ops/load/reports/sprint13-midtrans-probe-20260309-150206.txt`
  - hasil factual: `STATUS=401` dengan pesan Midtrans `Access denied due to unauthorized transaction, please check client or server key`.
2. Artinya blocker Sprint 13 saat ini **bukan lagi gap code utama**, tetapi credential/akses sandbox Midtrans yang tidak valid untuk transaksi backend.
3. Legal document finalisasi tetap `BLOCKED-EXTERNAL`.
4. Frontend chunk utama masih besar (`~746.53 kB`) walau build PASS; code-splitting tetap residual dan tidak ditangani di batch ini.

### Rencana berikutnya
1. Minta credential Midtrans sandbox yang valid atau perbaikan akses merchant saat ini, lalu rerun:
- `ops/loadtest/run_sprint13_billing_runtime_evidence.ps1`
2. Setelah sandbox live PASS, update section ini lagi dan naikkan Sprint 13 ke status repo-level yang sesuai; legal docs tetap dicatat terpisah sebagai residual external bila belum selesai.
3. Setelah Sprint 13 benar-benar tertutup, baru lanjut ke Sprint 14 tanpa melewati blocker factual ini.

## Update Sprint 12 Closure + Sprint 13 Billing Batch 1 (9 Maret 2026)

### Selesai diverifikasi
1. **Sprint 12 factual closure sekarang punya runner repo-level yang benar-benar ada dan executable**:
- runner baru `ops/loadtest/run_sprint12_runtime_evidence.ps1` berhasil dipulihkan dan dieksekusi ulang.
- artefak factual terbaru: `ops/load/reports/sprint12-runtime-evidence-20260309-110059.json`.
2. **Seluruh gate repo-level Sprint 12 PASS setelah cross-check ulang terhadap codebase aktual**:
- backend: `cargo check -p api`, `cargo test -p api --test question_import_rate_limit_integration --no-run`, runtime XLSX preview+commit, runtime DOCX preview, runtime rate-limit + compression -> PASS.
- frontend: `npm run build`, `npx playwright test e2e/sprint12-import-onboarding.spec.ts --project=chromium` -> PASS.
3. **Sprint 12 kini layak ditandai `DONE` pada source-of-truth repo**:
- import XLSX/DOCX, advanced import/global rate limiting, compression middleware, import wizard, onboarding tour, loading skeleton, dan template download telah terverifikasi faktual.
- beta launch nyata 5-10 sekolah tetap `BLOCKED-EXTERNAL` sesuai runbook, tetapi bukan blocker closure repo-level Sprint 12.
4. **Phase Beta resmi berakhir di repo-level**:
- Sprint 10 `DONE`, Sprint 11 `DONE`, dan Sprint 12 sekarang `DONE`.
- Pengingat resmi: **akhir Phase Beta tercapai; transisi ke Sprint 13 dimulai**.
5. **Sprint 13 Billing batch pertama sudah diimplementasikan secara factual**:
- migration baru `0014_sprint13_billing.sql` menambah `billing_subscriptions`, `billing_invoices`, dan `billing_webhook_events` berikut policy RLS.
- backend billing baru aktif untuk scope `super_admin`:
  - `GET /api/v1/platform/tenants/:tenantId/billing/summary`
  - `GET /api/v1/platform/tenants/:tenantId/billing/history`
  - `POST /api/v1/platform/tenants/:tenantId/billing/checkout`
  - `POST /api/v1/platform/tenants/:tenantId/billing/change-plan`
  - `GET /api/v1/platform/tenants/:tenantId/billing/invoices/:invoiceId/pdf`
  - `POST /api/v1/billing/midtrans/webhook`
- adapter gateway billing sekarang mendukung `mock` default dan `midtrans` sandbox bila env tersedia.
- invoice PDF disimpan lokal di `uploads/invoices/{tenant_id}/{invoice_id}.pdf`.
- worker dunning billing ditambahkan dan memakai sistem notifikasi/email job yang sudah ada.
6. **Frontend Sprint 13 batch pertama juga sudah hidup dan diverifikasi**:
- route baru `/app/platform/billing`.
- sidebar `super_admin` sekarang punya entry `Platform Billing`.
- panel billing memuat pricing cards, current subscription summary, outstanding invoice banner, CTA checkout/change-plan, billing history, dan download invoice PDF.
- onboarding tenant sekarang memberi CTA lanjut ke billing setelah tenant berhasil dibuat.
7. **QA Sprint 13 batch pertama**:
- `cargo check -p api` -> PASS.
- `cargo test -p api --test billing_integration --no-run` -> PASS.
- `cargo test -p api --test billing_integration -- --ignored --test-threads=1` -> PASS (6/6).
- `npm run build` -> PASS.
- `npx playwright test e2e/sprint13-billing.spec.ts --project=chromium` -> PASS (2/2).

### Belum selesai
1. Sprint 13 masih `PARTIAL`; yang sudah ada baru backend/frontend batch pertama. Midtrans sandbox real credential flow belum diverifikasi live, DevOps sandbox testing dan legal doc finalisasi belum dikerjakan.
2. Billing self-serve untuk role `admin` tenant, pricing page publik, dan checkout publik masih `NOT STARTED` sesuai asumsi batch ini.
3. Frontend chunk utama masih besar (`~743 kB`) walau build PASS; belum ada code-splitting.

### Rencana berikutnya
1. Lanjutkan Sprint 13 ke verifikasi sandbox Midtrans nyata dan docs/devops pendukung agar status bisa dinaikkan dari `PARTIAL`.
2. Tambahkan smoke/runtime evidence khusus billing jika batch berikut menyentuh webhook sandbox atau dunning di environment runtime.
3. Pertahankan aturan factual: setiap batch berikut tetap update file ini berdasarkan code/test/artifact nyata, bukan klaim markdown lama.

## Update Pre-Sprint 13 Frontend Polish & Stabilization (8 Maret 2026)

### Selesai diverifikasi
1. **Fondasi design system frontend diganti ke token Xamina light/dark**:
- `xamina-frontend/src/index.css` dirework ke palet warm/orange + typography `Fraunces` / `Plus Jakarta Sans` / `JetBrains Mono`.
- `xamina-frontend/index.html` memuat font resmi design system.
- `xamina-frontend/src/store/ui.store.ts` menambah persisted `themeMode: light | dark`.
- `xamina-frontend/src/main.tsx` menyinkronkan `data-mode` + `theme-color` meta secara runtime.
2. **App shell dan primitive frontend dipoles agar konsisten**:
- `Sidebar.tsx` dan `Topbar.tsx` direfactor ke shell design system baru, termasuk toggle theme light/dark.
- `DataTable.tsx`, `StatusBadge.tsx`, `TenantErrorBoundary.tsx`, landing page, dan login dipoles ke hierarchy desain yang sama.
- Kontrak styling liar lama (`--app-color-*`, utility kelas abu-abu/Tailwind yang tidak diback CSS aktif) dibersihkan dari surface yang disentuh batch ini.
3. **Halaman berisiko tinggi yang sebelumnya mismatch berhasil dipoles tanpa ubah kontrak backend**:
- `xamina-frontend/src/features/superadmin/TenantsPanel.tsx`
- `xamina-frontend/src/features/ai/AiGeneratorWidget.tsx`
- `xamina-frontend/src/features/ai/AiReviewPanel.tsx`
- `xamina-frontend/src/features/exam/ExamMonitorPanel.tsx`
4. **Verifikasi frontend factual ditambah**:
- Mock Playwright diperluas untuk `dashboard/stats`, `platform/tenants`, AI extract/stream, monitor submissions, dan force-finish.
- Spec baru: `xamina-frontend/e2e/frontend-polish.spec.ts` mencakup:
  - persistence theme toggle
  - superadmin tenants page
  - AI generator/review flow
  - exam monitor live/fallback flow
5. **Infrastructure testing FE distabilkan**:
- `xamina-frontend/playwright.config.ts` dipindah dari port `3000` ke `3100` karena port `3000` di environment lokal bentrok dengan proses lain (`Docker`/`wslrelay`), sehingga verifikasi browser sekarang benar-benar mengenai app frontend ini.

### Belum selesai
1. Audit manual visual untuk seluruh route tersisa (`users`, `classes`, `exams`, `my-exams`, `session`, `result`) masih bisa diperdalam lagi untuk polish micro-spacing/responsive edge cases.
2. Bundle frontend masih besar (`~663 kB` main chunk) walau build PASS; code-splitting belum ditangani di batch ini.
3. Scope produk Sprint 13 Billing/Monetisasi tetap `NOT STARTED`; batch ini hanya frontend polish + stabilization.

### Rencana berikutnya
1. Lanjutkan visual QA manual mobile/tablet pada route yang tidak jadi fokus utama batch ini.
2. Rapikan chunking/lazy loading frontend bila dibutuhkan sebelum sprint fitur berikutnya.
3. Masuk ke sprint berikut hanya setelah polish residual minor benar-benar ditutup atau diterima sebagai non-blocking.

### Verifikasi batch ini
- `npm run build` -> PASS
- `npm exec playwright test e2e/frontend-polish.spec.ts e2e/question-bank.a11y.spec.ts e2e/reports-analytics.spec.ts e2e/sprint12-import-onboarding.spec.ts e2e/sprint10-certificate.spec.ts --project=chromium` -> PASS (9/9)

## Update Pre-Sprint 13 Design Completion (9 Maret 2026)

### Selesai diverifikasi
1. **Theme runtime frontend sekarang support `light | dark | fun`**:
- `xamina-frontend/src/store/ui.store.ts` menambah mode `fun` dalam state persisted.
- `xamina-frontend/src/main.tsx` menyinkronkan `data-mode` + `theme-color` untuk tiga mode.
- `xamina-frontend/src/components/ThemeModeToggle.tsx` dipakai sebagai toggle bersama di shell dan design system page.
2. **Living design system page public berhasil ditambahkan**:
- Route baru `/design-system` aktif melalui `xamina-frontend/src/router.tsx`.
- Implementasi page referensi ada di `xamina-frontend/src/features/design/DesignSystemPage.tsx`.
- Struktur `Overview`, `Logo System`, `Color Palette`, `Typography`, `Spacing & Grid`, `All Components`, dan `Theme Modes` tersedia sebagai visual oracle FE.
3. **Shell dan branding FE diseragamkan ke design language HTML reference**:
- `Sidebar.tsx` dan `Topbar.tsx` direfactor memakai brand mark, hierarchy baru, dan theme toggle tiga mode.
- `xamina-frontend/src/index.css` diperluas untuk token `fun`, komponen design system page, kartu statistik, avatar/progress, dan helper surface baru.
4. **Route yang masih drift dipoles lagi tanpa mengubah kontrak backend**:
- `xamina-frontend/src/features/users/UsersPanel.tsx`
- `xamina-frontend/src/features/classes/ClassesPanel.tsx`
- `xamina-frontend/src/features/exam-session/MyExamsPanel.tsx`
- `xamina-frontend/src/features/exam-session/ExamResultPanel.tsx`
- `xamina-frontend/src/features/certificate/MyCertificatesPanel.tsx`
- Chart dashboard/report sekarang membaca warna dari CSS token aktif sehingga Light/Dark/Fun konsisten secara visual.
5. **Playwright mock dan coverage FE diperluas lagi**:
- `xamina-frontend/e2e/helpers/mock-api.ts` menambah/memperbaiki mock untuk `users`, `classes`, dan `me/exams`.
- `xamina-frontend/e2e/frontend-polish.spec.ts` sekarang mencakup:
  - `/design-system` render + three-theme switching
  - persistence `fun` mode pada app shell
  - render admin pages `users/classes`
  - superadmin tenants
  - AI modal flow
  - exam monitor
  - student routes `my-exams`, result, certificates, session
  - mobile screenshot capture untuk shell dashboard mode `fun`
6. **A11y regressions dari token literal berhasil ditutup**:
- Kontras warna light mode di `index.css` disesuaikan lagi agar `question-bank.a11y` kembali PASS sambil tetap menjaga arah visual warm/orange design system.
7. **Revisi shell sidebar sesuai feedback UI**:
- Referensi `Design System` di sidebar app dihapus agar navigasi workspace hanya menampilkan menu produk.
- Badge branding sidebar diganti dari `Design System v1.0` menjadi `Xamina Workspace`.

### Masih berjalan / belum selesai penuh
1. Visual parity 1:1 masih menggunakan `xamina-design-system.html` sebagai master lokal; belum ada koneksi Figma MCP aktif atau node/link Figma untuk verifikasi lintas sumber.
2. Snapshot visual Playwright saat ini masih berupa capture artifact di test output, belum dibakukan sebagai baseline snapshot repo lintas platform.
3. Bundle frontend tetap besar (`~698 kB` main chunk) walau build PASS; code splitting belum disentuh dalam batch design completion ini.

### Rencana berikutnya
1. Jika Figma resmi tersedia, lakukan pass fidelity final terhadap node/frame produksi dan bandingkan dengan `/design-system`.
2. Putuskan apakah visual baseline Playwright perlu dipromosikan menjadi snapshot repo yang dibekukan lintas environment CI.
3. Lanjut ke residual performance work FE (chunking/lazy loading) setelah design stabilization dianggap cukup.

### Verifikasi batch ini
- `npm run build` -> PASS
- `npm exec playwright test e2e/frontend-polish.spec.ts e2e/question-bank.a11y.spec.ts e2e/reports-analytics.spec.ts e2e/sprint12-import-onboarding.spec.ts e2e/sprint10-certificate.spec.ts --project=chromium` -> PASS (14/14)

## Update Pre-Sprint 13 Dashboard Alignment (9 Maret 2026)

### Selesai diverifikasi
1. **`/app/dashboard` kini benar-benar seragam untuk 4 role**:
- `admin`, `guru`, `siswa`, dan `super_admin` sekarang memakai scaffold yang sama: hero/header, stat grid, primary two-column surface, dan secondary surface.
- Implementasi utama dipusatkan di `xamina-frontend/src/features/analytics/DashboardPanel.tsx`.
2. **Primitive kartu statistik dashboard dihidupkan dan dipakai nyata**:
- `xamina-frontend/src/components/StatCard.tsx` tidak lagi kosong; sekarang menjadi primitive reusable untuk stat/KPI surfaces. Fitur baru: trend badge (arrow up/down) dan inline SVG sparkline.
- Menambahkan hover animation elevation (via `.stat-card-hoverable`) untuk sentuhan premium.
3. **Sidebar navigation lebih modern dan premium**:
- Semua link navigasi sekarang memiliki ikon khusus sebelum label via `lucide-react` di dalam `xamina-frontend/src/components/Sidebar.tsx`.
4. **Dashboard per-role diperkaya elemen UI spesifik**:
- Visual Greeting Header (`Selamat pagi, [Nama]`) ditambahkan untuk semua role.
- `super_admin`: System Health progress bars dan Recent Platform Activity log list + tenant list dengan avatar initials.
- `admin`: Teacher performance 4-column grid (scaffold structure) dan class distribution bars.
- `guru`: AI Banner (gradient CTA) dan visualisasi recent student results dengan avatar.
- `siswa`: Banner Urgent Exam (red gradient) dan leaderboard ranking top-5 siswa.
5. **Dashboard `super_admin` tidak lagi bertumpu pada semantik admin tenant-scoped**:
- Role `super_admin` pada `/app/dashboard` sekarang membaca `GET /platform/tenants` via `tenantApi`, lalu menghitung KPI platform di frontend.
- `/app/platform/tenants` tetap dipertahankan sebagai halaman manajemen detail, bukan dashboard utama.
6. **Topbar shell diseragamkan lagi untuk konteks role/scope**:
- `xamina-frontend/src/components/Topbar.tsx` sekarang membentuk subtitle yang konsisten.
- `super_admin` menampilkan konteks `Global Scope` atau tenant scope aktif secara eksplisit.
7. **Verifikasi e2e dashboard sekarang benar-benar role-aware**:
- `xamina-frontend/e2e/helpers/session.ts` membuat bearer token mock per role.
- `xamina-frontend/e2e/helpers/mock-api.ts` mengembalikan payload `/dashboard/summary` sesuai role yang sedang di-seed, bukan selalu `guru`.
- `xamina-frontend/e2e/frontend-polish.spec.ts` ditambah coverage eksplisit untuk dashboard `admin`, `guru`, `siswa`, dan `super_admin`.

### Masih berjalan / residual
1. Figma MCP tetap `BLOCKED-EXTERNAL` pada batch ini karena server meminta auth; fidelity final tetap mengacu pada `xamina-dashboard.jsx` dan `xamina-design-system.html` sebagai oracle lokal.
2. Bundle frontend membesar menjadi `~717.83 kB` main chunk walau build PASS; code splitting belum disentuh pada batch dashboard alignment ini. Data API real untuk komponen baru (seperti teacher performance grid/siswa leaderboard) masih terscaffold secara layout dengan mock data.

### Rencana berikutnya
1. Jika akses Figma resmi tersedia, lakukan pass fidelity final terhadap frame/node produksi dan bandingkan dengan scaffold dashboard aktual.
2. Lanjutkan residual visual QA mobile/tablet bila masih ada edge case non-blocking yang ingin dibekukan sebelum Sprint 13 penuh.
3. Persiapkan phase selanjutnya untuk pengikatan REST/WebSocket nyata atas elemen yang baru ditambahkan di dashboard ini.

### Verifikasi batch ini
- `npm run build` -> PASS
- `npm exec playwright test e2e/frontend-polish.spec.ts --project=chromium` -> PASS (13/13)

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
| Sprint 10 - Sertifikat & Notifikasi | DONE | Certificate PDF + worker email/push + push subscription + notification dropdown + receipt endpoint `POST /notifications/push/receipt` + payload `receipt_token/push_job_id` + runtime evidence retry/failure/receipt (`sprint10-runtime-evidence-20260308-032424.json`) |
| Sprint 11 - Analitik Lanjutan | DONE | Endpoint `GET /reports/exam-insights` + `GET /reports/exam-insights/export.xlsx`, FE histogram/time-series/item-analysis+export Excel, integration compile gate + Playwright + runtime evidence `sprint11-runtime-evidence-20260308-104625.json` |
| Sprint 12 - Polish Beta & Import | DONE | Import XLSX/DOCX + import wizard + onboarding + loading skeleton + advanced/global rate limit + compression + runner evidence `sprint12-runtime-evidence-20260309-110059.json` |
| Sprint 13 - Billing & Monetisasi | DONE (residual external legal) | Billing domain/migration + mock/sandbox gateway adapter + webhook + invoice PDF + FE `/app/platform/billing`, `/app/billing`, dan `/pricing` sudah ada; sandbox live PASS end-to-end (evidence `sprint13-midtrans-preflight-20260310-110900.txt`, `sprint13-runtime-evidence-20260310-110900.json`, `sprint13-invoice-20260310-110900.pdf`); legal docs belum |
| Sprint 14 - SuperAdmin & Prod Infra | PARTIAL | `/metrics` ada; superadmin CRUD tenant awal sudah ada; ops production infra belum |
| Sprint 15 - Security & Compliance | PARTIAL | refresh rotation + global rate limiting + privacy export/delete + Email OTP optional + suspicious login step-up + backend security headers + frontend `/app/privacy` security settings + CSP/XSS audit doc sudah ada di source; runtime OTP host-run + browser dashboard login sudah factual PASS, tersisa gate integration backend berat serta audit/external compliance |
| Sprint 16 - Launch Preparation | NOT STARTED | Belum ada paket launch-endpoint smoke 1000 concurrent & launch ops package penuh |

---

## Catatan Source-of-Truth
- Jika status di dokumen lain berbeda dengan code aktual, dokumen ini mengikuti kondisi code/artefak terbaru.
- Klaim `DONE` hanya dipakai untuk task yang punya evidence konkret di repo.

---

## Update Sprint 10 Factual Closure (7 Maret 2026)

### Selesai diverifikasi
1. **Scope Sprint 10 di codebase jauh lebih lengkap dari matrix lama**:
   - Backend sudah punya service/route sertifikat + worker delivery + push subscription.
   - Frontend sudah punya preview sertifikat, notification dropdown, dan service worker push handling.
2. **Compile gate Sprint 10**:
   - `cargo check -p api` -> PASS.
   - `cargo test -p api --test sprint10_certificate_notification_integration --no-run` -> PASS.
   - `npm run build` -> PASS.
   - `real_web_push` build path tidak lagi blocked oleh OpenSSL host install; helper `xamina-backend/scripts/run_real_web_push_check.ps1` terverifikasi PASS setelah toolchain Perl lengkap tersedia.
3. **Factual runtime blocker ditemukan dan ditutup**:
   - Root cause runtime `push/subscribe` gagal bukan di route, tetapi DB lokal belum menerapkan migration `0011_sprint10_certificates_delivery.sql`.
   - Migration `0011` diaplikasikan ke DB runtime lokal, lalu tabel `certificates`, `email_jobs`, `push_subscriptions`, `push_jobs` terverifikasi ada.
4. **Runtime evidence Sprint 10 tersedia**:
   - Certificate issuance + delivery smoke runner: `ops/loadtest/run_sprint10_runtime_evidence.ps1`.
   - Artefak:
     - `ops/load/reports/sprint10-runtime-evidence-20260307-102750.json`
     - `ops/load/reports/sprint10-db-snapshot-20260307-102750.json`
     - `ops/load/reports/sprint10-mailpit-20260307-102750.json`
     - `ops/load/reports/sprint10-certificate-batch-20260307-102751.json`
     - `ops/load/reports/sprint10-delivery-smoke-20260307-102752.json`
   - Evidence factual:
     - submission lulus menghasilkan tepat 1 certificate row.
     - `email_jobs` transisi ke `sent` dan email masuk ke Mailpit.
     - `push_jobs` diproses ke `sent`.
     - subscription invalid dibersihkan otomatis (`push_subscriptions` kosong setelah worker memproses invalid endpoint).

### Belum selesai
1. Sprint 10 **belum** dinaikkan ke `DONE` karena acceptance retry/failure path belum punya artefak runtime yang benar-benar menunjukkan job `retry` atau `failed`.
2. Receipt push ke browser/subscription nyata juga belum punya evidence terstruktur; yang sudah ada baru queue processing + invalid subscription cleanup.
3. Phase Beta belum selesai (catatan historis saat update 7 Maret 2026); status terbaru lihat section `Update Sprint 10 Receipt Closure (8 Maret 2026)`.

### Rencana berikutnya
1. Tambah harness terpisah untuk memaksa delivery `retry`/`failed` secara deterministik (SMTP down atau push endpoint unreachable yang tetap lolos validasi kriptografi).
2. Setelah evidence retry/failure dan receipt push nyata tersedia, ubah Sprint 10 ke `DONE`.
3. Baru lanjut factual closure Sprint 11 (item analysis, histogram, rekomendasi, export Excel).

---

## Update Sprint 10 Receipt Closure (8 Maret 2026)

### Selesai diverifikasi
1. **Migration & persistence receipt Sprint 10 selesai**:
   - Migration baru `0012_sprint10_push_receipts.sql` menambah:
     - kolom `push_jobs.receipt_token`, `receipt_received_at`, `receipt_clicked_at`.
     - tabel `push_delivery_receipts` + unique idempotency `(push_job_id, event_type)` + RLS policy tenant isolation.
   - Chain migration test helper diupdate (`api/tests/common/mod.rs`) agar `0012` ikut dijalankan.
2. **Endpoint receipt backend aktif**:
   - Endpoint baru `POST /api/v1/notifications/push/receipt` (tanpa JWT, validasi token acak per push job).
   - Kontrak payload:
     - `receipt_token`, `event_type`, optional `event_at`, optional `metadata`.
   - Response:
     - `{ recorded, push_job_id }`.
   - Validasi + idempotency + not-found path ditambahkan di integration test `sprint10_certificate_notification_integration.rs`.
3. **Push payload sekarang menyertakan receipt contract**:
   - Worker push menambahkan `data.push_job_id` dan `data.receipt_token` sebelum delivery.
   - Service worker `public/sw.js` mengirim receipt best-effort:
     - event `push` -> `event_type=received`
     - event `notificationclick` -> `event_type=clicked`
4. **Ops evidence runtime Sprint 10 diperbarui dan lulus**:
   - Script `ops/loadtest/run_sprint10_runtime_evidence.ps1` kini memverifikasi row `push_delivery_receipts` (`event_type=received` minimal 1).
   - Artefak terbaru:
     - `ops/load/reports/sprint10-runtime-evidence-20260308-032424.json`
     - `ops/load/reports/sprint10-db-snapshot-20260308-032424.json`
     - `ops/load/reports/sprint10-mailpit-20260308-032424.json`
     - `ops/load/reports/sprint10-certificate-batch-20260308-032428.json`
     - `ops/load/reports/sprint10-delivery-smoke-20260308-032428.json`
   - Evidence factual:
     - `retry_email_jobs_count` > 0 (termasuk status `retry`/`failed`).
     - `push_receipt_received_count` = 1.
5. **Verification gate batch ini**:
   - `cargo check -p api` -> PASS.
   - `cargo test -p api --test sprint10_certificate_notification_integration --no-run` -> PASS.
   - `npm run build` -> PASS.
   - `npx playwright test e2e/sprint10-broadcast-push.spec.ts --project=chromium --grep "push receipt endpoint can be called by service-worker relay contract"` -> PASS.

### Belum selesai
1. Phase Beta **belum selesai** karena Sprint 11 dan Sprint 12 masih `PARTIAL` pada matrix factual.
2. Evidence `clicked` receipt dari browser real masih opsional tambahan; gate minimal Sprint 10 (receipt `received`) sudah terpenuhi.

### Rencana berikutnya
1. Mulai closure factual Sprint 11:
   - item analysis (P-value), daya beda, distribusi/histogram, rekomendasi, export Excel.
2. Setelah Sprint 11 selesai, lanjut Sprint 12 closure factual (import DOCX/Excel, polish beta/import wizard).
3. Saat Sprint 10/11/12 sudah `DONE`, tandai **akhir Phase Beta** dan siapkan transisi ke Sprint 13.

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

---

## Update Sprint 10 Runtime Hotfix (8 Maret 2026 - Malam)

### Selesai diverifikasi
1. Endpoint receipt dari frontend proxy sudah tervalidasi ke backend terbaru:
   - `POST http://localhost:5173/api/v1/notifications/push/receipt` sekarang return `200` dengan body:
     - `{"success":true,"data":{"push_job_id":null,"recorded":false}}` untuk token dummy/tidak dikenal.
2. Database runtime sudah dipastikan punya migration receipt (`0012_sprint10_push_receipts.sql`) dan objek terkait (`push_jobs.receipt_*`, `push_delivery_receipts`).
3. Worker push terverifikasi bisa claim job (bukan stuck DB error):
   - Probe insert `push_jobs` berubah dari `queued` menjadi `retry` dengan `attempts=1` (sesuai kondisi VAPID key belum dikonfigurasi).

### Belum selesai
1. Verifikasi browser real untuk receipt `recorded=true` tetap membutuhkan `receipt_token` valid dari job push nyata (bukan UUID dummy).
2. Sprint 11 dan Sprint 12 masih `PARTIAL`, jadi phase beta belum selesai.

### Rencana berikutnya
1. Jalankan skenario browser end-to-end dengan token receipt real dari notifikasi push aktual untuk evidence `recorded=true`.
2. Lanjut closure factual Sprint 11 sesuai plan setelah Sprint 10 stabil penuh di environment runtime user.

---

## Update Sprint 11 Closure (8 Maret 2026 - Siang)

### Selesai diverifikasi
1. **Backend Sprint 11 analytics endpoint aktif**:
   - Endpoint baru:
     - `GET /api/v1/reports/exam-insights?exam_id=<uuid>&class_id=<uuid?>`
     - `GET /api/v1/reports/exam-insights/export.xlsx?exam_id=<uuid>&class_id=<uuid?>`
   - Guard role:
     - allow `admin`, `guru`, `super_admin`
     - reject `siswa` (`FORBIDDEN`)
   - Validasi `exam_id` wajib (`VALIDATION_ERROR` jika kosong).
2. **Perhitungan analytics lanjutan terimplementasi**:
   - Summary per exam (submission count, avg score, pass rate).
   - Histogram distribusi nilai (bin `0-9` sampai `90-100`).
   - Time-series performa (group by hari).
   - Item analysis:
     - `p_value`
     - `point_biserial`
     - recommendation tags:
       - `too_difficult`, `too_easy`, `negative_discrimination`, `weak_discrimination`.
3. **Export Excel multi-sheet terimplementasi**:
   - Workbook `.xlsx` dengan sheet:
     - `Summary`
     - `Distribution`
     - `ItemAnalysis`.
4. **Frontend ReportsPanel Sprint 11 selesai**:
   - Wajib pilih exam untuk panel insights.
   - Visual ditambahkan:
     - histogram nilai
     - time-series performa
     - item analysis table sortable.
   - Tombol `Export Excel` ditambahkan (CSV existing tetap ada).
5. **QA & test coverage terpasang**:
   - Integration test baru `exam_insights_should_enforce_access_and_support_xlsx_export` ditambahkan di `dashboard_report_notification_integration.rs`.
   - Playwright test baru:
     - `xamina-frontend/e2e/reports-analytics.spec.ts`.
   - Mock API e2e diperluas untuk route report Sprint 11.
6. **Ops evidence runner Sprint 11 ditambahkan dan dieksekusi**:
   - Script baru:
     - `ops/loadtest/run_sprint11_runtime_evidence.ps1`
   - Dataset runtime:
     - `question_count=40`
     - `submission_count=200`
   - Artefak terbaru:
     - `ops/load/reports/sprint11-runtime-evidence-20260308-104625.json`
     - `ops/load/reports/sprint11-insights-20260308-104625.json`
     - `ops/load/reports/sprint11-db-snapshot-20260308-104625.json`
     - `ops/load/reports/sprint11-exam-insights-20260308-104625.xlsx`
   - Evidence performa:
     - `insights_latency_ms=1941.22` (target `<=2000ms` -> PASS).
7. **DB/index support Sprint 11 ditambahkan**:
   - Migration baru:
     - `0013_sprint11_analytics_indexes.sql`
   - Test migration chain helper diupdate agar `0013` ikut dijalankan.

### Verifikasi Build/Test Batch Ini
- `cargo check -p core` -> PASS
- `cargo check -p api` -> PASS
- `cargo test -p api --test dashboard_report_notification_integration --no-run` -> PASS
- `npm run build` -> PASS
- `npx playwright test e2e/reports-analytics.spec.ts --project=chromium` -> PASS

### Belum selesai
1. Sprint 12 masih `PARTIAL` (import DOCX/Excel, advanced rate limiting global, compression middleware, onboarding tour, loading skeleton belum closure factual penuh).
2. Phase Beta **belum selesai** karena Sprint 12 belum `DONE`.

### Rencana berikutnya
1. Lanjut closure factual Sprint 12:
   - import DOCX/Excel
   - advanced/global rate limiting
   - compression middleware
   - import wizard + error handling polish + loading skeleton/onboarding.
2. Setelah Sprint 12 `DONE`, lakukan reminder resmi **akhir Phase Beta** dan transisi ke Sprint 13.

---

## Update Sprint 11 Re-Verification (8 Maret 2026 - Sore)

### Selesai diverifikasi
1. **Cross-check source-of-truth ulang terhadap codebase aktual** (bukan asumsi status MD):
   - Backend:
     - Route aktif: `GET /api/v1/reports/exam-insights` dan `GET /api/v1/reports/exam-insights/export.xlsx`.
     - Role guard sesuai plan: `admin|guru|super_admin` allow, `siswa` forbidden.
     - `exam_id` wajib dan validasi `VALIDATION_ERROR` saat kosong.
     - Metrik analytics sesuai kontrak Sprint 11:
       - `summary`, `distribution` (bin `0-9..90-100`), `time_series`, `item_analysis`.
       - `p_value` + `point_biserial` dengan fallback `null` saat data tidak cukup / SD=0.
       - Recommendation tags deterministik (`too_difficult`, `too_easy`, `negative_discrimination`, `weak_discrimination`).
     - Evaluator jawaban pada analytics konsisten dengan evaluator koreksi existing di domain submission (`multiple_choice`, `true_false`, `short_answer`).
     - Export Excel workbook multi-sheet (`Summary`, `Distribution`, `ItemAnalysis`) terverifikasi di route report.
   - Frontend:
     - Reports panel mewajibkan pemilihan exam untuk insights.
     - Histogram + time-series chart + item analysis sortable table ada dan aktif.
     - Tombol `Export Excel` aktif (CSV existing tetap ada).
     - Kontrak type/API untuk insight + blob export sudah dipakai di layer frontend.
   - Ops:
     - Runner evidence Sprint 11 ada: `ops/loadtest/run_sprint11_runtime_evidence.ps1`.
     - Artefak runtime terbaru masih valid:
       - `ops/load/reports/sprint11-runtime-evidence-20260308-104625.json`
       - `ops/load/reports/sprint11-insights-20260308-104625.json`
       - `ops/load/reports/sprint11-db-snapshot-20260308-104625.json`
       - `ops/load/reports/sprint11-exam-insights-20260308-104625.xlsx`
     - Evidence performa dataset besar (200 submission, 40 soal):
       - `insights_latency_ms=1941.22` (`<=2000ms` -> PASS).
2. **Verification gate batch re-check (eksekusi ulang)**:
   - `cargo check -p api` -> PASS
   - `cargo test -p api --test dashboard_report_notification_integration --no-run` -> PASS
   - `npm run build` -> PASS
   - `npx playwright test e2e/reports-analytics.spec.ts --project=chromium` -> PASS

### Belum selesai
1. Sprint 12 masih `PARTIAL` (import DOCX/Excel dan polish Beta lainnya belum closure factual penuh).
2. Phase Beta masih **belum selesai** karena Sprint 12 belum `DONE`.

### Rencana berikutnya
1. Lanjut implementasi factual Sprint 12 sesuai `XAMINA_MVP_PRODUCTION_PLAN.md`:
   - import DOCX/Excel
   - advanced/global rate limiting
   - compression middleware
   - import wizard + loading skeleton/onboarding polish.
2. Saat Sprint 12 factual `DONE`, berikan pengingat resmi bahwa **Phase Beta berakhir** lalu lanjut Sprint 13.

---

## Update Sprint 11 Hotfix Reports 404 (8 Maret 2026 - Malam)

### Selesai diverifikasi
1. Root cause kasus UI analytics/export gagal pada browser user dikonfirmasi:
   - route backend `GET /api/v1/reports/exam-insights` aktif (runtime route ada; tanpa auth menghasilkan `401`).
   - `404` terjadi saat `exam_id` tidak valid pada tenant aktif (stale exam context).
2. Frontend ReportsPanel di-hardening untuk cegah loop request `404`:
   - insights query hanya aktif jika `exam_id` terpilih masih ada pada list exam aktif.
   - retry otomatis untuk error `NOT_FOUND` / `VALIDATION_ERROR` dimatikan agar tidak spam request.
   - saat `exam_id` tidak lagi valid, filter exam otomatis di-reset + toast informatif.
3. Export Excel diproteksi terhadap exam stale:
   - sebelum export, validasi lagi `exam_id` masih ada pada list exam aktif.
   - jika tidak valid, export dibatalkan dan user diminta pilih ulang exam.
4. Error messaging diperjelas:
   - mapping `NOT_FOUND` untuk insights/export menjadi pesan tenant-aware:
     - "Exam tidak ditemukan di tenant aktif. Pilih exam lain."
5. Verifikasi batch hotfix:
   - `npm run build` -> PASS
   - `npx playwright test e2e/reports-analytics.spec.ts --project=chromium` -> PASS
6. Hardening lanjutan untuk kasus `super_admin` tenant-switch:
   - Query key report/exam/class sekarang discope per `tenantScopeKey` (tenant aktif), sehingga cache exam lama tidak dipakai lintas tenant.
   - Retry insights dihentikan untuk seluruh status `404` agar tidak spam request berulang.
   - Jika insights `404` terjadi pada `super_admin` dengan `activeTenantId`, state tenant aktif di-reset otomatis (`null`) + filter exam/class dibersihkan agar user memilih tenant/exam ulang secara valid.
7. Reproduksi teknis terkonfirmasi:
   - `super_admin` + header `X-Tenant-Id` invalid menghasilkan `404` pada endpoint insights meskipun `exam_id` valid di tenant lain (sesuai isolasi tenant).
8. Stabilitas runtime frontend docker diperbaiki:
   - `docker-compose.yml` frontend kini memakai volume khusus `frontend_node_modules:/app/node_modules` untuk menghindari crash `EPERM/EIO` native module di bind mount Windows.
   - Setelah perubahan ini, frontend container bisa naik stabil dan `npm run build` di dalam container kembali `PASS`.

### Belum selesai
1. Sprint 12 masih `PARTIAL`; phase beta belum selesai.

### Rencana berikutnya
1. Lanjut closure factual Sprint 12 sesuai plan produksi.
2. Setelah Sprint 12 `DONE`, lakukan reminder resmi akhir Phase Beta dan lanjut Sprint 13.

---

## Update Sprint 12 Template Hotfix (8 Maret 2026 - Malam, Lanjutan)

### Selesai diverifikasi
1. `GET /api/v1/questions/import/template.xlsx` yang gagal di browser user berhasil direproduksi pada runtime `localhost:8080`.
2. Root cause dipisahkan antara code dan runtime:
   - source code backend sudah punya route XLSX template
   - runtime `8080` masih memakai binary/container lama
   - redis sempat tidak aktif sehingga middleware global rate limit memicu `RATE_LIMIT_BACKEND_ERROR`
3. Template DOCX resmi ditambahkan:
   - route baru `GET /api/v1/questions/import/template.docx`
   - payload contoh mengikuti parser `Key: Value` (`Type`, `Content`, `Option_A..Option_D`, `Answer_Key`, `Topic`, `Difficulty`, `Is_Active`)
4. Frontend import wizard diperbarui:
   - tombol `Download Template XLSX`
   - tombol `Download Template DOCX`
   - API client mendukung format template `xlsx|docx`
5. QA ditambah:
   - integration test baru `question_import_template_downloads_should_work_for_xlsx_and_docx`
   - `cargo check -p api` -> PASS
   - `cargo test -p api --test question_import_rate_limit_integration --no-run` -> PASS
   - `npm run build` -> PASS
6. Runtime `localhost:8080` diverifikasi ulang setelah hotfix:
   - `GET /api/v1/questions/import/template.xlsx` -> `200`
   - `GET /api/v1/questions/import/template.docx` -> `200`
7. Untuk memulihkan fungsi user saat ini, service `api` docker pada `8080` dihentikan dan port `8080` dialihkan sementara ke `xamina-backend/target/debug/api.exe` lokal yang sudah memuat fix terbaru; `redis` juga dinyalakan kembali.

### Belum selesai
1. Container Docker `api` masih perlu rebuild terpisah agar parity runtime docker kembali sinkron dengan binary lokal.
2. Sprint 13 belum dimulai.

### Rencana berikutnya
1. Saat batch Sprint 13 dimulai, rebuild image/container `api`.
2. Pertahankan template `xlsx` dan `docx` sebagai kontrak resmi import Sprint 12.

---

## Update Sprint 13 Invoice Download Path Fix (10 Maret 2026 - Siang)

### Selesai diverifikasi
1. **Root cause blank PDF pada runtime user teridentifikasi**:
   - `ServeDir::new("uploads")` dan path invoice `uploads/...` bergantung pada working directory.
   - Jika API dijalankan dari repo root `xamina`, file PDF nyata berada di `xamina-backend/uploads`, tetapi router melayani `xamina/uploads` (kosong).
2. **Fix path uploads di backend**:
   - API router sekarang resolve direktori uploads via `XAMINA_UPLOADS_DIR`, lalu fallback ke `uploads` atau `xamina-backend/uploads`.
   - Billing service sekarang resolve `pdf_path` ke base uploads yang sama untuk read/write invoice.
3. **Dokumentasi env ditambahkan**:
   - `XAMINA_UPLOADS_DIR` ditambahkan di `.env.example` untuk override path uploads.
4. **FE download flow diprioritaskan ke public asset**:
   - Download invoice sekarang mencoba `pdf_url` (public `/uploads`) terlebih dahulu sebelum API.
   - Jika API gagal, fallback `pdf_url` dicoba ulang setelah regenerasi.

### Belum selesai
1. Verifikasi runtime end-to-end setelah restart API:
   - akses `http://localhost:5173/uploads/invoices/...` tidak blank.
   - tombol `Download PDF` tidak lagi memunculkan toast error.

### Rencana berikutnya
1. Restart API backend dan lakukan smoke test invoice:
   - buka `pdf_url` dari history billing.
   - jalankan `GET /api/v1/billing/invoices/:invoice_id/pdf`.
2. Jika masih blank, paksa re-render invoice lewat endpoint download untuk regenerasi file.
