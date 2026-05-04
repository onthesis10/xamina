import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Book, FileText, Zap, ChevronDown, MessageCircleQuestion } from "lucide-react";
import { XaminaLogo } from "@/components/XaminaLogo";

const CATEGORIES = [
  { id: "guru", title: "Panduan untuk Guru", icon: Book, count: 12 },
  { id: "siswa", title: "Panduan untuk Siswa", icon: FileText, count: 8 },
  { id: "admin", title: "Admin & Pengaturan Tenant", icon: Zap, count: 10 },
  { id: "billing", title: "Billing & Langganan", icon: MessageCircleQuestion, count: 10 },
];

const ALL_ARTICLES = [
  // Guru
  { id: "g1", title: "Cara membuat ujian dengan AI Generator", category: "guru", summary: "Panduan langkah demi langkah menggunakan fitur AI untuk menghasilkan soal HOTS secara otomatis.", content: "1. Buka menu 'Bank Soal'.\n2. Klik tombol 'Generate dengan AI'.\n3. Masukkan topik, jenjang, dan jumlah soal yang diinginkan.\n4. Tunggu beberapa detik, AI akan menghasilkan soal beserta kunci jawaban dan pembahasan.\n5. Anda bisa mereview, mengedit, atau langsung menyimpannya ke Bank Soal." },
  { id: "g2", title: "Menyiapkan bank soal dari file CSV", category: "guru", summary: "Import soal pilihan ganda dan essay dari file spreadsheet ke question bank.", content: "1. Buka menu 'Bank Soal'.\n2. Klik tombol 'Import CSV'.\n3. Unduh template CSV yang disediakan.\n4. Isi soal, opsi jawaban, dan kunci jawaban sesuai format template.\n5. Unggah file CSV yang sudah diisi. Sistem akan memvalidasi dan menyimpan soal secara massal." },
  { id: "g3", title: "Membuat jadwal ujian baru", category: "guru", summary: "Cara mengatur jadwal, durasi, dan peserta ujian.", content: "1. Buka menu 'Jadwal Ujian'.\n2. Klik 'Buat Jadwal Baru'.\n3. Pilih kelas/peserta dan pilih paket soal dari Bank Soal.\n4. Tentukan tanggal, waktu mulai, dan durasi ujian.\n5. Atur opsi keamanan (misal: acak soal, acak opsi, mode ketat).\n6. Klik 'Simpan dan Publikasikan'." },
  { id: "g4", title: "Mereview soal hasil generate AI", category: "guru", summary: "Memastikan kualitas soal AI sebelum digunakan.", content: "Setelah AI menghasilkan soal, Anda akan masuk ke halaman Review. Di sini Anda dapat membaca setiap soal, mengubah redaksi, mengganti kunci jawaban, atau menghapus soal yang tidak sesuai. Setelah yakin, klik 'Simpan ke Bank Soal'." },
  { id: "g5", title: "Memonitor ujian yang sedang berlangsung", category: "guru", summary: "Melihat status siswa secara real-time saat ujian.", content: "Saat ujian berlangsung, buka menu 'Jadwal Ujian' dan klik sesi ujian aktif. Anda akan melihat dashboard Live Monitor yang menampilkan siswa yang sedang online, progress pengerjaan, dan peringatan jika ada siswa yang terdeteksi melakukan kecurangan atau keluar dari halaman ujian." },
  { id: "g6", title: "Melakukan evaluasi dan grading essay", category: "guru", summary: "Cara memberikan nilai untuk soal tipe essay.", content: "1. Setelah ujian selesai, buka menu 'Laporan Ujian'.\n2. Pilih jadwal ujian yang ingin dievaluasi.\n3. Klik tab 'Koreksi Essay'.\n4. Sistem akan menampilkan jawaban siswa satu per satu. Anda dapat memberikan nilai dan feedback.\n5. Jika menggunakan AI grading, AI akan memberikan rekomendasi nilai berdasarkan rubrik yang Anda tentukan." },
  { id: "g7", title: "Mengunduh laporan analisis butir soal", category: "guru", summary: "Mendapatkan data statistik tingkat kesulitan soal.", content: "Di halaman 'Laporan Ujian', pilih ujian yang sudah selesai, lalu klik 'Analisis Soal'. Anda bisa melihat tingkat kesukaran, daya beda, dan distribusi jawaban siswa. Data ini dapat diunduh dalam format Excel atau PDF." },
  { id: "g8", title: "Mengelola kelas dan mata pelajaran", category: "guru", summary: "Membuat dan mengatur kelas yang diajar.", content: "Buka menu 'Kelas'. Di sini Anda dapat menambahkan kelas baru, mengundang siswa dengan membagikan kode kelas, dan mengelompokkan siswa berdasarkan mata pelajaran yang Anda ampu." },
  { id: "g9", title: "Membagikan token ujian ke siswa", category: "guru", summary: "Cara mengamankan ujian dengan token.", content: "Saat membuat jadwal ujian, Anda bisa mengaktifkan fitur 'Token'. Token unik akan di-generate otomatis. Bagikan token ini ke siswa sesaat sebelum ujian dimulai. Siswa harus memasukkan token yang benar untuk dapat mengakses soal." },
  { id: "g10", title: "Menambahkan soal bergambar atau audio", category: "guru", summary: "Memasukkan media ke dalam soal.", content: "Saat membuat atau mengedit soal secara manual di 'Bank Soal', gunakan editor teks yang tersedia untuk mengunggah gambar atau memasukkan link audio/video. Pastikan ukuran file tidak melebihi batas maksimal yang ditentukan (umumnya 5MB)." },
  { id: "g11", title: "Menggunakan mode presentasi untuk pembahasan", category: "guru", summary: "Membahas soal ujian di kelas setelah selesai.", content: "Setelah ujian selesai, Anda dapat menggunakan 'Mode Pembahasan'. Mode ini akan menampilkan soal, persentase siswa yang menjawab benar/salah untuk tiap opsi, dan kunci jawaban di layar lebar tanpa menampilkan nilai individu siswa." },
  { id: "g12", title: "Menyusun rubrik penilaian", category: "guru", summary: "Membuat standar penilaian untuk essay.", content: "Di menu 'Pengaturan Evaluasi', Anda dapat membuat rubrik. Tentukan kriteria penilaian dan bobot poin untuk masing-masing kriteria. Rubrik ini akan mempermudah dan menstandarkan proses koreksi manual Anda." },

  // Siswa
  { id: "s1", title: "Cara mengikuti ujian online", category: "siswa", summary: "Langkah-langkah dari login hingga submit jawaban.", content: "1. Login ke akun Xamina Anda.\n2. Di Dashboard, klik 'Ujian Saya' atau pilih jadwal ujian yang sedang aktif.\n3. Jika diminta, masukkan Token Ujian dari guru.\n4. Baca tata tertib, lalu klik 'Mulai Ujian'.\n5. Kerjakan soal. Anda bisa menandai soal yang ragu-ragu.\n6. Jika sudah selesai, pastikan semua soal terjawab, lalu klik 'Selesai & Kumpulkan'." },
  { id: "s2", title: "Menghadapi masalah koneksi saat ujian", category: "siswa", summary: "Troubleshooting lag atau disconnect.", content: "Jangan panik. Sistem kami otomatis menyimpan jawaban Anda secara berkala (auto-save). Jika terputus, refresh halaman atau login kembali. Anda akan melanjutkan tepat dari soal terakhir, asalkan waktu ujian belum habis." },
  { id: "s3", title: "Mengunduh sertifikat ujian otomatis", category: "siswa", summary: "Mengakses sertifikat setelah ujian selesai.", content: "Jika guru mengaktifkan fitur sertifikat, Anda bisa mengunduhnya setelah nilai dirilis. Buka menu 'Sertifikat Saya', pilih ujian yang bersangkutan, dan klik 'Unduh PDF'." },
  { id: "s4", title: "Melihat riwayat nilai dan evaluasi", category: "siswa", summary: "Mengecek hasil ujian yang sudah berlalu.", content: "Buka menu 'Riwayat Ujian'. Di sana Anda dapat melihat daftar ujian yang pernah diikuti beserta skor akhirnya. Jika guru mengizinkan, Anda juga bisa melihat analisis jawaban benar/salah untuk tiap soal." },
  { id: "s5", title: "Tentang Lockdown Browser / Mode Ketat", category: "siswa", summary: "Apa yang terjadi jika Anda membuka tab lain?", content: "Jika ujian menggunakan Mode Ketat, Anda dilarang membuka tab baru, mengecilkan jendela browser, atau menggunakan aplikasi lain. Sistem akan mencatat setiap pelanggaran dan memberikan peringatan. Pelanggaran berulang dapat menyebabkan ujian dihentikan otomatis." },
  { id: "s6", title: "Mengubah profil dan password", category: "siswa", summary: "Mengatur informasi akun pribadi.", content: "Klik foto profil atau nama Anda di pojok kanan atas, lalu pilih 'Pengaturan Akun'. Di sini Anda bisa mengubah nama tampilan, foto, dan mengganti password." },
  { id: "s7", title: "Bergabung ke kelas baru", category: "siswa", summary: "Cara masuk ke kelas menggunakan kode.", content: "Di Dashboard utama, klik tombol 'Gabung Kelas'. Masukkan kode unik kelas yang diberikan oleh guru Anda. Anda akan otomatis terdaftar di kelas tersebut dan bisa melihat jadwal ujiannya." },
  { id: "s8", title: "Menandai soal yang ragu-ragu", category: "siswa", summary: "Fitur navigasi soal ujian.", content: "Saat ujian, jika Anda belum yakin dengan jawaban, centang opsi 'Ragu-ragu' di bawah soal. Di panel navigasi sebelah kanan, nomor soal tersebut akan berubah warna (biasanya kuning) sebagai penanda agar Anda bisa meninjaunya kembali sebelum submit." },

  // Admin
  { id: "a1", title: "Cara mengatur role akses pengguna baru", category: "admin", summary: "Langkah menambah admin, guru, atau siswa.", content: "1. Buka menu 'Manajemen Pengguna'.\n2. Klik 'Tambah Pengguna Baru'.\n3. Masukkan data diri (Nama, Email).\n4. Pilih Role: Admin (akses penuh), Guru (akses bank soal & jadwal), atau Siswa.\n5. Klik 'Simpan'." },
  { id: "a2", title: "Reset password siswa secara massal", category: "admin", summary: "Melakukan reset password banyak siswa sekaligus.", content: "Buka menu 'Manajemen Pengguna' > 'Siswa'. Centang nama-nama siswa yang lupa password (atau klik 'Pilih Semua'). Klik tombol 'Aksi Massal' dan pilih 'Reset Password'. Sistem akan menghasilkan password sementara baru untuk didistribusikan." },
  { id: "a3", title: "Import data siswa dari Excel/CSV", category: "admin", summary: "Cara cepat mendaftarkan ratusan siswa.", content: "1. Buka menu 'Manajemen Pengguna' > 'Siswa'.\n2. Klik 'Import CSV'.\n3. Unduh format template yang disediakan.\n4. Isi data (NIS, Nama, Email, Kelas) ke dalam template.\n5. Unggah file tersebut, periksa preview data, lalu klik 'Proses Import'." },
  { id: "a4", title: "Pengaturan identitas sekolah (Tenant)", category: "admin", summary: "Mengubah logo, nama, dan info sekolah.", content: "Buka menu 'Pengaturan Sistem' > 'Identitas Sekolah'. Anda bisa mengubah nama institusi, mengunggah logo sekolah (akan tampil di halaman ujian siswa), mengatur zona waktu default, dan kontak resmi sekolah." },
  { id: "a5", title: "Melihat log aktivitas sistem", category: "admin", summary: "Melacak perubahan yang dilakukan oleh user lain.", content: "Di menu 'Log Audit', Anda bisa melihat catatan lengkap tentang siapa melakukan apa dan kapan. Mulai dari perubahan jadwal ujian, penghapusan soal, hingga login gagal." },
  { id: "a6", title: "Manajemen tahun ajaran dan semester", category: "admin", summary: "Pengaturan periode akademik aktif.", content: "Buka menu 'Pengaturan Akademik'. Anda bisa membuat Tahun Ajaran baru (misal: 2026/2027) dan menentukan semester aktif. Ini berguna untuk pengarsipan data ujian dan nilai agar tidak tercampur." },
  { id: "a7", title: "Membuat template sertifikat kustom", category: "admin", summary: "Desain sertifikat kelulusan sekolah.", content: "Di menu 'Template Sertifikat', Anda bisa mengunggah background sertifikat kosong (.JPG/.PNG) dan menggunakan drag-and-drop editor untuk menempatkan variabel dinamis seperti [Nama Siswa], [Nilai], [Nama Ujian], dan [Tanggal]." },
  { id: "a8", title: "Pengaturan integrasi API & SSO", category: "admin", summary: "Menghubungkan Xamina dengan sistem sekolah lain.", content: "Jika Anda menggunakan paket Enterprise, buka menu 'Integrasi'. Di sini Anda bisa mendapatkan API Key dan mengatur Single Sign-On (SSO) agar siswa bisa login menggunakan akun Google Workspace atau Microsoft 365 sekolah." },
  { id: "a9", title: "Membersihkan data ujian lama", category: "admin", summary: "Menghapus data untuk menghemat kuota.", content: "Penting: Data yang dihapus tidak bisa dikembalikan. Buka menu 'Pengaturan Sistem' > 'Manajemen Data'. Pilih periode data (misal: lebih tua dari 2 tahun) dan jenis data (jawaban siswa, log ujian), lalu konfirmasi penghapusan permanen." },
  { id: "a10", title: "Menangani siswa yang terkunci ujiannya", category: "admin", summary: "Membuka blokir siswa di tengah ujian.", content: "Jika siswa terkunci karena pelanggaran Mode Ketat atau masalah teknis, Admin (atau Guru) bisa membuka menu 'Jadwal Ujian', masuk ke 'Live Monitor', cari nama siswa tersebut, dan klik 'Unblock / Reset Sesi' agar siswa bisa melanjutkan." },

  // Billing
  { id: "b1", title: "Memahami perhitungan tagihan bulanan", category: "billing", summary: "Cara billing dihitung berdasarkan jumlah user dan paket.", content: "Xamina menggunakan model tagihan berbasis Paket + Kuota Ekstra. Anda membayar biaya dasar paket pilihan Anda (Starter/Pro/Enterprise) yang mencakup sejumlah pengguna aktif dan kredit AI. Jika penggunaan melebihi kuota paket, akan dikenakan biaya tambahan per user/kredit di bulan berikutnya." },
  { id: "b2", title: "Mengaktifkan dan upgrade paket", category: "billing", summary: "Cara upgrade paket dari Starter ke Professional.", content: "1. Login sebagai Admin Utama.\n2. Buka menu 'Billing & Langganan'.\n3. Klik 'Lihat Paket'.\n4. Pilih paket Professional, lalu klik 'Upgrade'.\n5. Masukkan rincian pembayaran. Fitur baru akan langsung aktif setelah pembayaran dikonfirmasi." },
  { id: "b3", title: "Metode pembayaran yang diterima", category: "billing", summary: "Pilihan cara membayar tagihan Xamina.", content: "Kami menerima pembayaran melalui Transfer Bank (Virtual Account BCA, Mandiri, BNI, BRI), Kartu Kredit (Visa/Mastercard), dan E-Wallet (GoPay, OVO, Dana)." },
  { id: "b4", title: "Mengunduh invoice bulanan", category: "billing", summary: "Mendapatkan bukti bayar untuk keperluan administrasi.", content: "Buka menu 'Billing & Langganan'. Gulir ke bawah ke bagian 'Riwayat Tagihan'. Anda akan melihat daftar semua invoice. Klik ikon 'Unduh PDF' pada invoice yang Anda butuhkan." },
  { id: "b5", title: "Apa itu AI Credits?", category: "billing", summary: "Penjelasan tentang kuota generasi soal AI.", content: "AI Credits digunakan saat fitur AI Generator membuat soal atau melakukan grading essay. 1 Kredit = 1 Soal Pilihan Ganda. Grading essay mungkin memakan lebih banyak kredit tergantung panjang jawaban. Kuota kredit di-reset setiap siklus tagihan." },
  { id: "b6", title: "Membeli tambahan AI Credits (Add-on)", category: "billing", summary: "Cara menambah kuota AI jika habis di tengah bulan.", content: "Jika kuota AI Credits habis sebelum akhir bulan, buka menu 'Billing & Langganan', lalu klik 'Beli Kuota Tambahan'. Pilih paket add-on kredit yang tersedia (misal: +1000 Credits). Tambahan ini berlaku satu kali (one-time)." },
  { id: "b7", title: "Membatalkan langganan (Downgrade)", category: "billing", summary: "Prosedur berhenti berlangganan paket berbayar.", content: "Anda dapat membatalkan langganan kapan saja dari menu 'Billing'. Paket akan tetap aktif hingga akhir periode tagihan saat ini. Setelah itu, akun Anda akan otomatis kembali ke paket Gratis (Free Tier) dengan fitur terbatas." },
  { id: "b8", title: "Apa itu 'Active Users'?", category: "billing", summary: "Definisi pengguna aktif dalam perhitungan tagihan.", content: "Active Users dihitung berdasarkan jumlah unik siswa dan guru yang melakukan login atau mengikuti ujian dalam satu siklus tagihan (bulan). Akun yang terdaftar namun tidak pernah login tidak akan dihitung dalam kuota tagihan bulanan." },
  { id: "b9", title: "Pajak Pertambahan Nilai (PPN)", category: "billing", summary: "Informasi pajak pada tagihan.", content: "Semua harga paket dan add-on yang ditampilkan belum termasuk PPN 11% sesuai peraturan yang berlaku di Indonesia. PPN akan ditambahkan secara otomatis pada rincian akhir di invoice Anda." },
  { id: "b10", title: "Mengganti email penerima tagihan", category: "billing", summary: "Mengatur siapa yang menerima email invoice.", content: "Buka menu 'Billing & Langganan', klik 'Pengaturan Billing'. Di sana Anda dapat menambahkan atau mengubah alamat email kontak keuangan (Finance Contact) yang akan menerima notifikasi tagihan dan invoice setiap bulan." },
];

const POPULAR_TAGS = ["Reset Password", "AI Generator", "Sertifikat Ujian", "Import CSV", "Upgrade Paket"];

const smoothEase = [0.22, 1, 0.36, 1];

export function HelpCenterRoutePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const filteredArticles = ALL_ARTICLES.filter((article) => {
    const matchesSearch =
      !searchQuery ||
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !activeCategory || article.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const activeCategoryTitle = activeCategory
    ? CATEGORIES.find((c) => c.id === activeCategory)?.title
    : null;

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col font-sans relative">
      {/* Background Orbs */}
      <motion.div
        className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[160px] opacity-[0.1] pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 60%)" }}
      />
      
      <header className="py-4 px-8 flex items-center justify-between border-b border-white/5 bg-[var(--surface-1)]/70 sticky top-0 z-50 backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <Link to="/">
            <XaminaLogo variant="animated" text="Xamina Help" />
          </Link>
        </div>
        <nav className="flex gap-4 items-center">
          <Link to="/pricing" className="text-sm font-medium hover:text-[var(--primary)] transition-colors">Pricing</Link>
          <Link to="/auth/login" className="btn btn-primary text-sm shadow-lg shadow-primary/20 rounded-full px-6">Masuk Dashboard</Link>
        </nav>
      </header>

      <main className="flex-1 relative z-10">
        {/* Search Hero Section */}
        <section className="bg-gradient-to-b from-[var(--surface-1)]/50 to-[var(--bg-app)] py-20 px-6 text-center border-b border-[var(--border)] relative overflow-hidden">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: smoothEase }} className="max-w-3xl mx-auto space-y-8 relative z-10">
            <h1 className="text-5xl font-black text-[var(--text-0)] font-serif italic tracking-tight">Apa yang bisa kami bantu?</h1>
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--text-3)]" size={24} />
              <input 
                type="text" 
                placeholder="Cari panduan, FAQ, atau topik..." 
                className="w-full pl-16 pr-6 py-5 rounded-2xl bg-[var(--surface-1)]/80 backdrop-blur-sm border-2 border-[var(--border)] text-[var(--text-0)] text-lg shadow-xl shadow-black/5 focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveCategory(null);
                  setExpandedArticle(null);
                }}
              />
            </div>
            <div className="flex flex-wrap justify-center items-center gap-3 pt-4">
              <span className="text-[var(--text-2)] text-sm font-medium uppercase tracking-wider text-xs">Populer:</span>
              {POPULAR_TAGS.map((tag, i) => (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  key={tag}
                  onClick={() => {
                    setSearchQuery(tag);
                    setActiveCategory(null);
                    setExpandedArticle(null);
                  }}
                  className={`text-xs px-4 py-2 rounded-full border border-[var(--border)] font-bold transition-all ${
                    searchQuery === tag
                      ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                      : "bg-[var(--surface-1)] text-[var(--text-1)] hover:bg-[var(--primary-bg)] hover:text-primary hover:border-primary/30"
                  }`}
                >
                  {tag}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Categories Section */}
        <section className="py-16 px-6 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {CATEGORIES.map((cat, i) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <motion.div 
                  key={cat.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease: smoothEase }}
                  onClick={() => {
                    setActiveCategory(isActive ? null : cat.id);
                    setSearchQuery("");
                    setExpandedArticle(null);
                  }}
                  className={`card p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--primary)]/5 transition-all cursor-pointer group border rounded-[1.5rem] relative overflow-hidden ${
                    isActive
                      ? "border-primary/40 bg-gradient-to-br from-primary/10 to-transparent shadow-lg shadow-primary/10"
                      : "border-[var(--border)] bg-[var(--surface-1)]/50 backdrop-blur-sm"
                  }`}
                >
                  {isActive && <div className="absolute inset-0 border-2 border-primary rounded-[1.5rem] opacity-50 pointer-events-none" />}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:-rotate-3 transition-transform ${
                    isActive ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-[var(--primary-bg)] text-primary border border-primary/20"
                  }`}>
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-0)] mb-2 tracking-tight">{cat.title}</h3>
                  <p className="text-[var(--text-2)] text-sm font-medium">{cat.count} artikel panduan</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Filtered Articles / FAQ Accordion */}
        <section className="py-10 px-6 max-w-4xl mx-auto min-h-[500px]">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border)]">
            <h2 className="text-2xl font-black text-[var(--text-0)] flex-1 tracking-tight">
              {searchQuery
                ? `Hasil pencarian "${searchQuery}"`
                : activeCategoryTitle
                  ? activeCategoryTitle
                  : "Semua Artikel & FAQ"}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-[var(--text-2)] bg-[var(--surface-2)] px-3 py-1 rounded-full border border-[var(--border)]">
                {filteredArticles.length} Hasil
              </span>
              {(searchQuery || activeCategory) && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setActiveCategory(null);
                    setExpandedArticle(null);
                  }}
                  className="text-sm text-primary hover:underline font-bold shrink-0"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={searchQuery + (activeCategory ?? "")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {filteredArticles.length === 0 ? (
                <div className="text-center py-20 bg-[var(--surface-1)]/50 rounded-3xl border border-dashed border-[var(--border)]">
                  <div className="w-16 h-16 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--text-3)]">
                    <Search size={28} />
                  </div>
                  <p className="text-[var(--text-1)] text-xl font-bold tracking-tight">Tidak ada artikel ditemukan</p>
                  <p className="text-[var(--text-2)] mt-2">Coba kata kunci lain atau gunakan kategori di atas.</p>
                </div>
              ) : (
                filteredArticles.map((article, i) => {
                  const categoryTitle = CATEGORIES.find((c) => c.id === article.category)?.title ?? article.category;
                  const isExpanded = expandedArticle === article.id;

                  return (
                    <motion.div 
                      key={article.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                        isExpanded 
                          ? "bg-[var(--surface-1)] border-primary/30 shadow-lg shadow-primary/5" 
                          : "bg-[var(--surface-1)]/80 border-[var(--border)] hover:border-primary/20 hover:shadow-md"
                      }`}
                    >
                      <button 
                        onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                        className="w-full text-left px-6 py-5 flex items-start justify-between group focus:outline-none"
                      >
                        <div className="flex-1 min-w-0 pr-6">
                          <h4 className={`font-bold transition-colors text-lg tracking-tight ${isExpanded ? "text-primary" : "text-[var(--text-0)] group-hover:text-primary"}`}>
                            {article.title}
                          </h4>
                          <p className="text-[var(--text-2)] text-sm mt-1.5 font-medium leading-relaxed">{article.summary}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded border border-[var(--primary)]/20">
                              {categoryTitle}
                            </span>
                          </div>
                        </div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                          isExpanded ? "bg-primary/10 text-primary rotate-180" : "bg-[var(--surface-2)] text-[var(--text-3)] group-hover:bg-primary/10 group-hover:text-primary"
                        }`}>
                          <ChevronDown size={18} strokeWidth={2.5} />
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: smoothEase }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-6 pt-2 border-t border-[var(--border)]/50 mt-2">
                              <div className="prose prose-sm max-w-none text-[var(--text-1)] whitespace-pre-line leading-relaxed bg-[var(--surface-2)]/50 p-5 rounded-xl border border-[var(--border)]">
                                {article.content}
                              </div>
                              <div className="mt-6 flex items-center justify-between">
                                <span className="text-xs text-[var(--text-3)] font-medium">Artikel ini membantu?</span>
                                <div className="flex gap-2">
                                  <button className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--success)]/10 hover:text-[var(--success)] hover:border-[var(--success)]/30 transition-colors">Ya</button>
                                  <button className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] hover:border-[var(--danger)]/30 transition-colors">Tidak</button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* CTA Support Section */}
        <section className="py-20 px-6 max-w-4xl mx-auto text-center mt-10">
          <div className="bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-1)] border border-[var(--border)] p-12 rounded-[2.5rem] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <h3 className="text-3xl font-black text-[var(--text-0)] tracking-tight mb-4 relative z-10">Masih Butuh Bantuan?</h3>
            <p className="text-[var(--text-2)] text-lg max-w-xl mx-auto mb-8 relative z-10">
              Tim support kami siap membantu Anda menyelesaikan masalah teknis atau memberikan panduan penggunaan fitur Xamina.
            </p>
            <button className="btn btn-primary rounded-full px-8 py-4 text-lg shadow-xl shadow-primary/20 hover:scale-105 transition-transform active:scale-95 relative z-10">
              Hubungi Tim Support
            </button>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-[var(--border)] text-center text-[var(--text-2)] bg-[var(--surface-1)]/80 backdrop-blur-md relative z-10">
        <p className="text-sm font-bold tracking-wide">© 2026 Xamina CBT Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
