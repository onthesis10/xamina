# Sprint 10 Certificate Load Test

## Scope
- Generate sertifikat batch dari submission yang lulus.
- Pantau drain queue `email_jobs` dan `push_jobs`.

## Metrik minimum
- Total sertifikat terbit per menit.
- Rata-rata waktu dari `submission finish` ke `certificate_issued`.
- Persentase `email_jobs`/`push_jobs` status `sent`.
- Jumlah `failed` per jenis job.

## Langkah uji
1. Siapkan dataset submission lulus.
2. Jalankan script batch:
   - `ops/loadtest/run_sprint10_certificate_batch.ps1`
3. Jalankan smoke delivery:
   - `ops/loadtest/run_sprint10_delivery_smoke.ps1`
4. Ambil snapshot query:
   - `SELECT status, COUNT(*) FROM email_jobs GROUP BY status;`
   - `SELECT status, COUNT(*) FROM push_jobs GROUP BY status;`

## Kriteria lulus awal (MVP)
- Tidak ada duplicate certificate per `submission_id`.
- Mayoritas job mencapai `sent`.
- Retry berjalan (ada transisi `retry` saat simulasi gagal).
