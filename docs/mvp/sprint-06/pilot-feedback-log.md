# Pilot Feedback Log (Execution Record)

Tanggal eksekusi: 24 Februari 2026
Environment: local/staging-like (docker compose)

| Date | Role | Area | Feedback | Severity | Repro Steps | Owner | Status |
|---|---|---|---|---|---|---|---|
| 2026-02-24 | Guru | Exam Publish | Precheck conflict message sudah jelas, tidak membingungkan. | P3 | publish exam bentrok jadwal | Backend | Done |
| 2026-02-24 | Siswa | Exam Session | Start/resume/finish flow berjalan, timer sinkron. | P3 | start exam -> answer -> finish | Backend/FE | Done |
| 2026-02-24 | Admin | Reports | Export CSV bekerja sesuai filter kelas/ujian. | P3 | open report -> export csv | FE | Done |
| 2026-02-24 | Admin | User Import | Upload CSV file multipart berhasil, error row tampil. | P2 | import file invalid+valid | Backend/FE | Done |
| 2026-02-24 | Admin | Classes | Delete/deactivate class in-use diblokir dengan code CLASS_IN_USE. | P2 | assign user to class -> delete/deactivate | Backend | Done |

## Summary
- Total feedback: 5
- P1: 0
- P2: 2 (resolved)
- P3: 3 (resolved)
- Closed: 5
