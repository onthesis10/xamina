# Xamina Billing & Payment Terms (Template)

Dokumen ini adalah template legal untuk closure repo-level Sprint 13 (Billing & Monetisasi). Finalisasi legal tetap membutuhkan approval eksternal.

## 1. Paket dan Harga
- Plan dasar: `starter`, `professional`, `enterprise`.
- Nilai harga final mengikuti kontrak/quotation resmi.

## 2. Siklus Penagihan
- Penagihan dilakukan per periode subscription.
- Invoice diterbitkan otomatis melalui sistem billing.

## 3. Metode Pembayaran
- Metode pembayaran mengikuti gateway yang dikonfigurasi (misalnya Midtrans sandbox/live).
- Link checkout disediakan per invoice.

## 4. Jatuh Tempo dan Dunning
- Invoice memiliki `due_at`.
- Jika belum dibayar, sistem dapat menerapkan dunning (`pending`, `overdue`, `failed`) sesuai kebijakan.

## 5. Perubahan Plan
- Upgrade/downgrade plan diproses melalui flow billing.
- Efek perubahan plan terhadap kuota mengikuti kebijakan komersial final.

## 6. Pajak dan Biaya Tambahan
- Pajak, fee transaksi, dan biaya pihak ketiga mengikuti regulasi/kontrak yang berlaku.

## 7. Refund dan Pembatalan
- Kebijakan refund/cancellation: `[isi kebijakan final legal/finance]`.

## 8. Sengketa Pembayaran
- Diselesaikan melalui mekanisme support resmi dan dokumen bukti transaksi/invoice.

## Status Template
- `DRAFT-TEMPLATE` (belum final, belum signed).
