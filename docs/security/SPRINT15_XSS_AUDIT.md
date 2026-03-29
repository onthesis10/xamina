# Sprint 15 XSS Audit

Tanggal audit: 26 Maret 2026

## Ringkasan
- Pencarian source repo untuk sink berisiko dilakukan dengan pattern:
  - `dangerouslySetInnerHTML`
  - `innerHTML =`
  - `__html`
- Hasil audit tidak menemukan penggunaan `dangerouslySetInnerHTML` aktif di frontend maupun backend.
- Ditemukan satu penggunaan `div.innerHTML = input` di `xamina-frontend/src/features/question/QuestionBankPanel.tsx`, tetapi konteksnya dipakai untuk mengubah rich text input menjadi plain text melalui `textContent`, bukan untuk merender HTML tak dipercaya ke UI.

## Temuan
1. `xamina-frontend/src/features/question/QuestionBankPanel.tsx`
   - Fungsi `sanitizeToPlainText()` membuat elemen DOM sementara, menulis `input` ke `innerHTML`, lalu membaca `textContent`.
   - Pola ini berfungsi sebagai normalisasi input editor menjadi plain text.
   - Tidak ada temuan sink render HTML mentah ke halaman dari alur ini.

## Kesimpulan
- Tidak ada bukti sink XSS render aktif berbasis `dangerouslySetInnerHTML` di codebase saat audit ini dijalankan.
- Residual risk tetap ada pada area rich text/editor jika di masa depan alur penyimpanan atau preview berubah menjadi render HTML. Area itu perlu diaudit ulang setiap kali format konten berubah dari plain text menjadi rich HTML.
