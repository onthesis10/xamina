🚀 XAMINA: Blueprint UI/UX & Engineering Polish

Visi: Mengubah Xamina dari sistem ujian fungsional (MVP) menjadi platform edukasi premium yang indah, elegan, responsif, dan sangat memanjakan mata pengguna (Siswa, Guru, Admin, Superadmin), didukung oleh Backend yang tangguh dan blazing fast.

🎨 BAGIAN 1: FRONTEND & UI/UX POLISH (Menciptakan Mahakarya Visual)

Fokus utama di sini adalah transisi dari UI "standar" menjadi UI "Elegan & Kaya Warna" dengan micro-interactions yang mulus.

1.1. Fondasi Desain & Theming (Elegan & Kaya Warna)

Dynamic Theming Engine: Implementasikan sistem Color Palette yang bisa di-kustomisasi. Gunakan skema warna modern (misal: Deep Violet dipadu dengan Vibrant Coral atau Ocean Blue dengan Neon Mint).

Glassmorphism & Depth: Gunakan efek tembus pandang (backdrop-blur di Tailwind) pada elemen seperti modal, dropdown, dan sidebar, dikombinasikan dengan bayangan (soft shadows) untuk memberikan kesan 3D dan kedalaman.

Typography Scale: Gunakan font yang bersih dan sangat legible (misal: Inter untuk UI, Merriweather atau Lora untuk teks soal ujian agar mudah dibaca).

Motion & Animation: Wajib mengintegrasikan library seperti framer-motion atau auto-animate. Jangan ada perubahan state yang kaku; semuanya harus memiliki transisi (fade, slide, pop).

1.2. Pengalaman Ujian Siswa (The "Zen" Exam Interface)

Role Siswa harus merasa fokus, tidak stres, tapi juga kagum dengan UI-nya.

Immersive Mode (Zen Mode): Saat ujian dimulai, UI masuk ke mode full-screen. Hilangkan sidebar, sisakan hanya konten soal, timer, dan navigasi esensial.

Floating Progress & Timer: Buat timer dan progress bar melayang (sticky) di atas atau bawah dengan desain melengkung (rounded pill). Berikan perubahan warna yang halus pada timer (Hijau -> Kuning -> Merah berdenyut perlahan saat waktu hampir habis).

Interactive Question Palette: Navigasi nomor soal di samping dengan warna status yang jelas:

⬜ Abu-abu: Belum dilihat

🟩 Hijau dengan pop animation: Sudah dijawab

🟧 Oranye/Kuning: Ragu-ragu (Mark for review)

Satisfying Micro-interactions: Saat siswa memilih opsi (A, B, C, D), berikan animasi "klik" atau efek ripple yang memuaskan. Saat pindah soal, gunakan animasi slide-left/right yang smooth.

Network Status Indicator: Indikator kecil elegan di pojok yang menunjukkan status koneksi WebSocket (Hijau: Connected, Merah: Offline + Auto-save to local).

1.3. Dashboard Role (Guru, Admin, Superadmin) - Keren & Informatif

Greeting Banners: Banner selamat datang yang kaya warna (mungkin dengan ilustrasi SVG abstrak/gradient mesh) yang menyapa nama pengguna dan memberikan ringkasan instan ("Selamat Pagi, Budi! Ada 3 ujian yang sedang berjalan hari ini").

Staggered Card Animations: Saat dashboard dimuat, kartu-kartu statistik (StatCard) muncul dengan efek bertahap (staggered fade-up).

Data Visualization (Charts): Poles fitur analitik. Jangan gunakan chart standar. Gunakan efek gradient fill pada area chart, dan tambahkan custom tooltips saat di-hover. (Rekomendasi: Recharts atau Tremor.so).

Data Table Polishing: Buat tabel data (DataTable.tsx) terlihat bersih. Gunakan zebra-striping yang sangat halus, hover state pada baris, dan pastikan sticky header dengan bayangan bawah saat di-scroll.

1.4. Workflow & Feedback yang Solid

Skeleton Loaders: Ganti spinner standar dengan LoadingSkeleton berbentuk layout halaman aslinya. Ini mengurangi cognitive load pengguna saat menunggu.

Toast Notifications (ToastViewport): Buat notifikasi muncul dari bawah/samping dengan animasi spring. Gunakan ikon yang sesuai dan kode warna (Sukses, Error, Peringatan).

Empty States: Jika sebuah tabel kosong (misal: belum ada ujian), jangan hanya tampilkan teks "Data Kosong". Berikan ilustrasi SVG yang indah dan tombol Call-to-Action yang mencolok ("+ Buat Ujian Pertamamu").

⚙️ BAGIAN 2: BACKEND POLISH (Stabilitas, Skalabilitas, Keamanan)

Backend Rust Anda sudah menjadi pondasi yang sangat hebat. Kini saatnya memolesnya agar bullet-proof.

2.1. Optimasi WebSocket (Ujian Real-time)

Ping/Pong Heartbeat yang Efisien: Pastikan koneksi WebSocket ws_bus.rs memiliki mekanisme heartbeat untuk mendeteksi siswa yang putus koneksi secara real-time tanpa membebani server.

State Recovery: Jika siswa disconnect dan reconnect, BE harus mengirimkan current state (jawaban terakhir, sisa waktu) dalam hitungan milidetik agar transisi di FE tidak terasa terputus.

Broadcast Throttling: Pada kelas dengan ribuan siswa, jangan broadcast status setiap detik ke pengawas. Lakukan batching atau kirim setiap 3-5 detik untuk mengurangi traffic WebSocket.

2.2. Arsitektur & Performa API

Unified Error Handling: Di error.rs, pastikan semua error dibungkus dengan format JSON yang konsisten.

Struktur yang baik: { "error_code": "ERR_TIME_UP", "message": "Waktu ujian telah habis.", "details": null }

Ini memudahkan FE untuk memetakan error ke UI/UX yang elegan.

Pagination & Filtering: Pastikan semua endpoint yang mengembalikan list (seperti list soal, list user) memiliki pagination (limit/offset atau cursor) dan pencarian terindeks di database (crates/db).

Caching Strategy: Untuk data yang jarang berubah (seperti Bank Soal atau Daftar Kelas), implementasikan In-Memory Cache (Redis atau moka-rs) untuk mengurangi beban ke PostgreSQL.

2.3. Keamanan Tingkat Lanjut

Strict Rate Limiting: Perketat rate_limit.rs, terutama di endpoint Auth, Submit Ujian, dan AI Generation untuk mencegah eksploitasi.

Concurrency Control pada Submission: Pastikan submission/service.rs menangani race conditions (misal: siswa menekan tombol "Submit" berulang kali secara cepat) menggunakan database transactions atau idempotency keys.

Audit Logging: Poles platform_audit.rs. Pastikan semua aktivitas krusial (hapus soal, ubah nilai, buat ujian) tercatat dengan detail (Siapa, Kapan, IP, Perubahan) untuk kebutuhan Superadmin Console.

🗺️ TAHAPAN IMPLEMENTASI (Action Plan)

Tahap 1: Desain & Komponen Fondasi (1-2 Minggu)

Perbarui tailwind.config.ts dengan sistem warna baru, palet dark/light mode, dan animasi khusus.

Refactor komponen dasar di src/components/ (Input, Button, Modal) untuk menggunakan gaya visual baru (Framer motion + Glassmorphism).

Tahap 2: Rework Pengalaman Siswa (2 Minggu)

Fokus penuh pada ExamSessionPanel.tsx.

Implementasikan UI "Zen Mode", Question Palette, dan Auto-save indicator.

Uji WebSocket handling (disconnect/reconnect) dari sisi BE dan FE.

Tahap 3: Visualisasi Dashboard (1 Minggu)

Rombak DashboardPanel.tsx untuk semua role.

Integrasikan library charting dan buat animasi saat load.

Tahap 4: Backend Polish & Stress Test (1-2 Minggu)

Rapikan sistem Error Handling di Rust.

Jalankan skrip load testing (ops/loadtest/run_ws_loadtests.ps1) untuk memastikan UI dan WebSocket tetap stabil di bawah tekanan ribuan koneksi.

Blueprint ini dirancang untuk mengangkat nilai jual Xamina dari sekadar aplikasi ujian menjadi platform yang dicintai oleh penggunanya karena keindahan dan keandalannya. Gaskeun! 🚀