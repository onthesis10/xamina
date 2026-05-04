import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { BookOpen, ShieldCheck, Zap, Server, CheckCircle2, ArrowUpRight, PlayCircle, ArrowRight, Sparkles, Users, GraduationCap, Activity, BarChart3, Clock, Settings, ChevronRight } from "lucide-react";
import { XaminaLogo } from "@/components/XaminaLogo";

// --- CUSTOM EASING UNTUK ANIMASI PREMIUM ---
const smoothEase = [0.22, 1, 0.36, 1];

// --- BRAND LOGO COMPONENT ---
interface BrandLogoProps {
  compact?: boolean;
  tagline?: string;
  badge?: string;
}

export function BrandLogo({ compact = false, tagline, badge }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-4 ${compact ? "scale-90 origin-left" : ""}`.trim()}>
      <div className="relative group cursor-pointer">
        <div className="absolute -inset-2 rounded-2xl bg-[var(--primary)]/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative w-11 h-11 flex items-center justify-center">
          <XaminaLogo variant="animated-icon" style={{ transform: "scale(1.2)" }} />
        </div>
      </div>
      <div>
        <div className="font-extrabold text-2xl tracking-tight text-[var(--text-0)] flex items-center gap-0">
          Xamin<span className="text-[var(--primary)]">a</span>
          {badge && <span className="px-2 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] text-[10px] uppercase tracking-wider font-bold border border-[var(--primary)]/20">{badge}</span>}
        </div>
        {tagline && <p className="text-[var(--text-3)] text-xs font-medium tracking-wide mt-0.5">{tagline}</p>}
      </div>
    </div>
  );
}

// --- FEATURES DATA ---
const FEATURES = [
  {
    icon: Zap,
    title: "Bikin Soal Pakai AI",
    desc: "Macet ide bikin soal HOTS? Biar AI kami yang buatin ratusan pilihan ganda atau esai dalam hitungan detik. Tinggal review, beres.",
    color: "var(--primary)"
  },
  {
    icon: ShieldCheck,
    title: "Anti-Nyontek Club",
    desc: "Dilengkapi lockdown browser dan deteksi kecurangan proaktif. Siswa mencoba navigasi tab lain? Sistem mendeteksi seketika.",
    color: "var(--success)"
  },
  {
    icon: Server,
    title: "Satu Sistem, Banyak Sekolah",
    desc: "Arsitektur multi-tenant khusus yayasan atau dinas. Setiap sekolah memiliki workspace dan isolasi data nilai yang aman.",
    color: "var(--info)"
  },
  {
    icon: BookOpen,
    title: "Pantau Nilai Real-time",
    desc: "Hilangkan beban rekap manual. Begitu ujian selesai, sistem langsung menyajikan analisis butir soal dan distribusi metrik nilai.",
    color: "var(--violet)"
  }
];

const fadeUpVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: smoothEase } }
};

const AdminPreview = () => (
  <motion.div initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: smoothEase }} className="space-y-8 h-full flex flex-col">
    <div className="flex items-center justify-between pb-6 border-b border-[var(--border)]">
      <div>
        <h3 className="text-2xl font-bold text-[var(--text-0)] tracking-tight">Overview Terpadu</h3>
        <p className="text-[var(--text-3)] text-sm mt-1">Metrik performa sekolah secara real-time</p>
      </div>
      <div className="px-4 py-1.5 rounded-full bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20 text-xs font-bold flex items-center gap-2 shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]"></span>
        </span>
        Sistem Operasional
      </div>
    </div>
    <div className="grid grid-cols-3 gap-5">
      {[
        { icon: Users, label: "Total Siswa", value: "1,240" },
        { icon: GraduationCap, label: "Guru Aktif", value: "48" },
        { icon: Server, label: "Ujian Berjalan", value: "5" }
      ].map((stat, i) => (
        <div key={i} className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--text-3)]/30 transition-colors shadow-sm">
          <div className="text-[var(--text-2)] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"><stat.icon size={16} className="text-[var(--primary)]" /> {stat.label}</div>
          <div className="text-4xl font-black text-[var(--text-0)] tracking-tight">{stat.value}</div>
        </div>
      ))}
    </div>
    <div className="p-6 rounded-3xl bg-gradient-to-r from-[var(--surface-1)] to-[var(--surface-2)] border border-[var(--border)] shadow-sm flex items-center justify-between mt-auto">
      <div>
        <div className="text-lg font-bold text-[var(--text-0)] flex items-center gap-2">UTS Ganjil Berlangsung <span className="text-[var(--info)]"><Activity size={18} /></span></div>
        <div className="text-[var(--text-2)] text-sm mt-1 font-medium">420 siswa sedang online mengerjakan soal</div>
      </div>
      <button className="px-5 py-2.5 rounded-xl bg-[var(--info)]/10 border border-[var(--info)]/20 text-[var(--info)] text-sm font-bold flex items-center gap-2 hover:bg-[var(--info)] hover:text-white transition-all duration-300">
        Live Monitor <ChevronRight size={16} />
      </button>
    </div>
  </motion.div>
);

const GuruPreview = () => (
  <motion.div initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: smoothEase }} className="space-y-8 h-full flex flex-col">
    <div className="flex items-center justify-between pb-6 border-b border-[var(--border)]">
      <div>
        <h3 className="text-2xl font-bold text-[var(--text-0)] tracking-tight">Ruang Kerja Guru</h3>
        <p className="text-[var(--text-3)] text-sm mt-1">Kelola kelas dan evaluasi ujian</p>
      </div>
      <button className="px-5 py-2.5 rounded-xl bg-[var(--text-0)] text-[var(--bg-app)] text-sm font-bold shadow-lg shadow-[var(--text-0)]/20 flex items-center gap-2 hover:-translate-y-0.5 transition-transform">
        <Sparkles size={16} className="text-[var(--primary)]" /> Generate AI
      </button>
    </div>
    <div className="grid grid-cols-2 gap-5">
      <div className="p-6 rounded-3xl bg-[var(--surface-1)] border border-[var(--border)] hover:shadow-xl hover:shadow-[var(--border)] transition-all duration-300 flex flex-col justify-between group">
        <div>
          <div className="text-[var(--text-1)] font-bold text-lg mb-1">Matematika Wajib XII</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--warning)]/10 text-[var(--warning)] text-xs font-bold mt-2 border border-[var(--warning)]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" /> Berlangsung
          </div>
        </div>
        <div className="mt-8">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-[10px] text-[var(--text-2)] font-bold mb-1 tracking-widest uppercase">Penyelesaian Kelas</div>
              <div className="text-3xl font-black text-[var(--text-0)]">32<span className="text-[var(--text-3)] text-lg">/36</span></div>
            </div>
            <BarChart3 size={28} className="text-[var(--warning)] opacity-50 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
          </div>
          <div className="h-2 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: "88%" }} transition={{ duration: 1, delay: 0.2, ease: smoothEase }} className="h-full bg-[var(--warning)] rounded-full" />
          </div>
        </div>
      </div>
      <div className="p-6 rounded-3xl bg-[var(--surface-1)] border border-[var(--border)] hover:shadow-xl hover:shadow-[var(--border)] transition-all duration-300 flex flex-col justify-between group">
        <div>
          <div className="text-[var(--text-1)] font-bold text-lg mb-1">Fisika Dasar XI</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--success)]/10 text-[var(--success)] text-xs font-bold mt-2 border border-[var(--success)]/20">
            <CheckCircle2 size={12} /> Dievaluasi
          </div>
        </div>
        <div className="mt-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-[10px] text-[var(--text-2)] font-bold mb-1 tracking-widest uppercase">Rata-rata Kelas</div>
              <div className="text-3xl font-black text-[var(--text-0)]">84.5</div>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="text-xs px-3 py-1.5 bg-[var(--surface-2)] text-[var(--text-1)] rounded-lg font-bold border border-[var(--border)]">Nilai A: 12</span>
            <span className="text-xs px-3 py-1.5 bg-[var(--surface-2)] text-[var(--text-1)] rounded-lg font-bold border border-[var(--border)]">Nilai B: 20</span>
          </div>
        </div>
      </div>
    </div>
  </motion.div>
);

const SiswaPreview = () => (
  <motion.div initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: smoothEase }} className="space-y-6 h-full flex flex-col">
    <div className="flex items-center justify-between pb-4">
      <h3 className="text-3xl font-bold text-[var(--text-0)] tracking-tight">Halo, Budi 👋</h3>
    </div>

    <div className="p-8 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] text-white shadow-xl shadow-[var(--primary)]/20 relative overflow-hidden shrink-0 border border-white/10">
      <div className="absolute -right-10 -top-10 w-64 h-64 bg-white/20 rounded-full blur-3xl" />
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold tracking-widest mb-4 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> UJIAN AKTIF
          </div>
          <div className="text-2xl font-bold mb-2 tracking-tight">UAS Biologi Semester Ganjil</div>
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Clock size={16} /> Sisa Waktu: 45 Menit
          </div>
        </div>
        <button className="px-8 py-3.5 rounded-2xl bg-white text-[var(--primary)] font-bold shadow-lg shadow-black/10 hover:scale-105 transition-transform whitespace-nowrap active:scale-95">
          Lanjutkan Ujian
        </button>
      </div>
    </div>

    <div className="flex-1 flex flex-col mt-2">
      <h4 className="font-bold text-[var(--text-2)] text-xs uppercase tracking-widest mb-4 px-1">Riwayat Nilai</h4>
      <div className="space-y-3">
        {[
          { subject: "Matematika Peminatan", score: 92, date: "Hari ini, 09:00 WIB" },
          { subject: "Bahasa Inggris Lanjut", score: 88, date: "Kemarin, 13:30 WIB" }
        ].map((res, i) => (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, duration: 0.5 }} key={res.subject} className="flex items-center justify-between p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] hover:shadow-md transition-all group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--success)]/10 text-[var(--success)] flex items-center justify-center shrink-0 border border-[var(--success)]/20">
                <CheckCircle2 size={24} strokeWidth={2.5} />
              </div>
              <div>
                <div className="font-bold text-[var(--text-0)] text-lg tracking-tight group-hover:text-[var(--primary)] transition-colors">{res.subject}</div>
                <div className="text-sm text-[var(--text-3)] font-medium mt-0.5">{res.date}</div>
              </div>
            </div>
            <div className="text-2xl font-black text-[var(--text-0)] bg-[var(--surface-2)] px-4 py-2 rounded-xl border border-[var(--border)]">{res.score}</div>
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

function DashboardPreview() {
  const [activeRole, setActiveRole] = useState<"admin" | "guru" | "siswa">("guru");

  return (
    <div className="rounded-[2.5rem] border border-[var(--border)]/50 bg-gradient-to-b from-[var(--surface-1)]/40 to-[var(--surface-1)]/10 backdrop-blur-3xl shadow-2xl shadow-[var(--primary)]/10 p-3 overflow-hidden mx-auto max-w-6xl">
      <div className="rounded-[2rem] overflow-hidden border border-[var(--border)] bg-[var(--bg-app)] flex flex-col h-[650px] shadow-inner relative text-left">

        {/* Sleek Browser/App Toolbar */}
        <div className="h-14 border-b border-[var(--border)] bg-[var(--surface-1)]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 relative z-20">
          <div className="flex gap-2.5">
            <div className="w-3.5 h-3.5 rounded-full bg-[#FF5F56] border border-black/10 shadow-sm" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] border border-black/10 shadow-sm" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#27C93F] border border-black/10 shadow-sm" />
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 flex bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--border)] shadow-inner">
            {(["admin", "guru", "siswa"] as const).map(role => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`relative px-6 py-1.5 rounded-lg text-sm font-bold capitalize transition-all duration-300 ${activeRole === role ? "text-[var(--text-0)]" : "text-[var(--text-3)] hover:text-[var(--text-1)]"}`}
              >
                {activeRole === role && (
                  <motion.div layoutId="activeTab" className="absolute inset-0 bg-[var(--surface-1)] rounded-lg shadow-sm border border-[var(--border)]" style={{ borderRadius: 8 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className="relative z-10">{role}</span>
              </button>
            ))}
          </div>

          <div className="w-16 hidden md:flex items-center justify-end text-[var(--text-3)]">
            <Settings size={16} className="cursor-pointer hover:text-[var(--text-0)] transition-colors" />
          </div>
        </div>

        {/* Dashboard Layout */}
        <div className="flex-1 flex overflow-hidden bg-[var(--bg-app)]">
          {/* Sidebar */}
          <div className="w-64 border-r border-[var(--border)] bg-[var(--surface-1)]/30 backdrop-blur-md p-5 hidden md:flex flex-col gap-2 relative z-10">
            <div className="flex items-center gap-3 mb-8 px-2">
              <BrandLogo compact />
            </div>

            <div className="space-y-1">
              <div className="h-11 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-bold flex items-center px-4 gap-3 shadow-sm border border-[var(--primary)]/20 cursor-default">
                <Activity size={18} /> Dashboard Utama
              </div>
              <div className="h-11 rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-2)] text-sm font-medium flex items-center px-4 gap-3 cursor-pointer transition-colors">
                <BookOpen size={18} /> {activeRole === "siswa" ? "Ujian Saya" : "Bank Soal"}
              </div>
              <div className="h-11 rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-2)] text-sm font-medium flex items-center px-4 gap-3 cursor-pointer transition-colors">
                <BarChart3 size={18} /> Analitik & Laporan
              </div>
            </div>

            <div className="mt-auto h-11 rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-2)] text-sm font-medium flex items-center px-4 gap-3 cursor-pointer transition-colors">
              <Settings size={18} /> Pengaturan Sistem
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-8 md:p-10 overflow-y-auto relative z-0">
            <AnimatePresence mode="wait">
              {activeRole === "admin" && <AdminPreview key="admin" />}
              {activeRole === "guru" && <GuruPreview key="guru" />}
              {activeRole === "siswa" && <SiswaPreview key="siswa" />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -200]);
  const opacityFade = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] font-sans overflow-x-hidden selection:bg-[var(--primary)] selection:text-white relative text-[var(--text-1)]">

      {/* Premium Background Orbs (Soft Glows) */}
      <motion.div
        className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[160px] opacity-[0.15] pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 60%)", y: y1 }}
      />
      <motion.div
        className="fixed top-[40%] right-[-20%] w-[600px] h-[600px] rounded-full blur-[140px] opacity-[0.12] pointer-events-none z-0"
        style={{ background: "radial-gradient(circle, var(--violet) 0%, transparent 60%)", y: y2 }}
      />

      {/* Glassmorphism Floating Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 md:p-6 md:pt-8 transition-all">
        <header className="max-w-6xl mx-auto rounded-full border border-[var(--border)]/60 bg-[var(--surface-1)]/70 backdrop-blur-2xl shadow-sm px-6 py-3.5 flex items-center justify-between">
          <BrandLogo badge="" />

          <nav className="hidden md:flex gap-8 items-center font-medium text-[var(--text-2)] text-sm tracking-wide">
            <Link to="/pricing" className="hover:text-[var(--text-0)] transition-colors">Harga</Link>
            <a href="/#features" className="hover:text-[var(--text-0)] transition-colors">Fitur</a>
            <Link to="/help" className="hover:text-[var(--text-0)] transition-colors">Bantuan</Link>
            <div className="w-px h-5 bg-[var(--border)]"></div>
            <Link to="/auth/login" className="hover:text-[var(--text-0)] transition-colors font-bold">Masuk</Link>
            <Link to="/onboarding" className="bg-[var(--text-0)] text-[var(--bg-app)] px-6 py-2.5 rounded-full font-bold shadow-lg shadow-[var(--text-0)]/20 text-sm flex items-center gap-2 group hover:scale-105 transition-transform active:scale-95">
              Mulai Gratis <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </nav>
        </header>
      </div>

      {/* Hero Section */}
      <section className="relative pt-52 pb-32 px-6 text-center z-10 flex flex-col items-center justify-center min-h-[90vh]">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="relative max-w-5xl mx-auto flex flex-col items-center"
          style={{ opacity: opacityFade }}
        >
          <motion.div variants={fadeUpVariants}>
            <h1 className="text-6xl md:text-[6.5rem] font-black text-[var(--text-0)] tracking-tighter leading-[1.05] mb-8">
              Ujian <span className="font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)]">Lancar</span>, <br />
              Admin Tenang.
            </h1>
          </motion.div>

          <motion.p variants={fadeUpVariants} className="text-xl md:text-2xl text-[var(--text-2)] max-w-3xl mx-auto leading-relaxed mb-12 font-medium">
            Lupakan drama server down saat ujian serentak. Biarkan sistem cerdas kami yang mengurus infrastruktur, Anda cukup fokus pada kualitas evaluasi.
          </motion.p>

          <motion.div variants={fadeUpVariants} className="flex flex-col sm:flex-row items-center justify-center gap-5 w-full sm:w-auto">
            <Link to="/onboarding" className="text-lg px-8 py-4 rounded-2xl w-full sm:w-auto bg-gradient-to-b from-[var(--primary)] to-[var(--primary-2)] text-white font-bold shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-[var(--primary)]/30 group relative overflow-hidden hover:scale-105 active:scale-95 transition-all duration-300 border border-white/20">
              <span className="relative z-10 flex items-center justify-center gap-2">
                Coba Gratis Sekarang
                <ArrowUpRight size={20} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </span>
            </Link>
            <Link to="/auth/login" className="text-lg px-8 py-4 rounded-2xl w-full sm:w-auto bg-[var(--surface-1)]/50 backdrop-blur-md border border-[var(--border)] text-[var(--text-0)] font-bold hover:bg-[var(--surface-2)] group transition-all duration-300">
              <span className="flex items-center justify-center gap-2">
                <PlayCircle size={20} className="text-[var(--text-2)] group-hover:text-[var(--text-0)] transition-colors" />
                Lihat Demo
              </span>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Interactive Mockup Preview */}
      <section className="relative px-6 pb-40 z-10">
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, ease: smoothEase }}
          className="w-full"
        >
          <DashboardPreview />
        </motion.div>
      </section>

      {/* Social Proof - Elegant Logos */}
      <section className="py-20 border-y border-[var(--border)] bg-[var(--surface-1)]/30 backdrop-blur-md z-10 relative">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-xs font-bold text-[var(--text-3)] uppercase tracking-widest mb-10">Dipercaya oleh institusi pendidikan terkemuka</p>
          <div className="flex flex-wrap justify-center items-center gap-x-20 gap-y-10 opacity-50 grayscale hover:grayscale-0 transition-all duration-700">
            {["SMKN 1 Cianjay", "Universitas Konoha", "Bina Konoha", "Kementerian Kegelapan"].map(name => (
              <span key={name} className="text-2xl font-black text-[var(--text-1)] italic font-serif tracking-tight">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid - Premium Cards */}
      <section className="py-40 px-6 max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-24 space-y-6">
          <h2 className="text-4xl md:text-6xl font-black text-[var(--text-0)] tracking-tight">Lebih Dari Sekadar <span className="font-serif italic text-[var(--primary)]">Aplikasi Ujian</span></h2>
          <p className="text-[var(--text-2)] text-xl max-w-2xl mx-auto leading-relaxed font-medium">Dirancang dengan presisi untuk menyederhanakan kompleksitas, memastikan Anda tidur nyenyak di masa ujian.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
          {FEATURES.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.8, ease: smoothEase }}
                className="relative p-10 md:p-12 bg-gradient-to-br from-[var(--surface-1)] to-[var(--bg-app)] border border-[var(--border)] hover:border-[var(--text-3)]/30 transition-all duration-500 group rounded-[2.5rem] overflow-hidden"
              >
                {/* Subtle highlight effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--text-0)]/0 to-[var(--text-0)]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6 border border-white/10" style={{ backgroundColor: `${feat.color}15`, color: feat.color }}>
                    <Icon size={32} strokeWidth={2} />
                  </div>
                  <h3 className="text-3xl font-extrabold text-[var(--text-0)] mb-4 tracking-tight">{feat.title}</h3>
                  <p className="text-[var(--text-2)] text-lg leading-relaxed font-medium">{feat.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA - Deep Glassmorphism */}
      <section className="py-32 px-6 z-10 relative">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: smoothEase }}
          className="max-w-6xl mx-auto bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] rounded-[3.5rem] p-12 md:p-24 text-center shadow-2xl shadow-[var(--primary)]/20 relative overflow-hidden border border-[var(--primary)]/50"
        >
          {/* Internal Orbs for depth */}
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-white/20 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-black/20 blur-[100px] rounded-full pointer-events-none" />

          <div className="relative z-10 space-y-10">
            <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight leading-[1.1]">
              Waktunya Beralih ke <br /><span className="font-serif italic">Sistem Premium.</span>
            </h2>
            <p className="text-xl md:text-2xl text-white/80 max-w-2xl mx-auto font-medium">
              Tinggalkan aplikasi usang yang sering bermasalah. Mulai gunakan Xamina hari ini, setup selesai dalam hitungan menit.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-6">
              <Link to="/onboarding" className="text-xl px-12 py-5 rounded-full bg-white text-[var(--primary)] font-bold shadow-xl shadow-black/10 group hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-2">
                Buat Akun Institusi
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 pt-10 text-sm font-bold text-white/70 tracking-widest uppercase">
              <span className="flex items-center gap-2"><CheckCircle2 size={18} /> Setup Instan</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={18} /> Tanpa Kartu Kredit</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={18} /> Dukungan Prioritas</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer - Minimalist & Clean */}
      <footer className="bg-[var(--surface-1)]/50 border-t border-[var(--border)] pt-24 pb-12 px-6 relative z-10 mt-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
          <div className="col-span-1 md:col-span-2">
            <div className="mb-6">
              <BrandLogo tagline="More Than Just an Exam" />
            </div>
            <p className="text-[var(--text-3)] text-base max-w-sm leading-relaxed font-medium">Dirancang secara spesifik untuk memastikan kegiatan belajar mengajar dan evaluasi berjalan tanpa hambatan teknis.</p>
          </div>
          <div>
            <h4 className="font-bold text-[var(--text-0)] text-sm mb-6 tracking-widest uppercase">Navigasi</h4>
            <ul className="space-y-4 text-[var(--text-2)] font-medium text-sm">
              <li><Link to="/pricing" className="hover:text-[var(--primary)] transition-colors">Harga Paket</Link></li>
              <li><Link to="/auth/login" className="hover:text-[var(--primary)] transition-colors">Masuk Admin</Link></li>
              <li><Link to="/onboarding" className="hover:text-[var(--primary)] transition-colors">Daftar Institusi Baru</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-[var(--text-0)] text-sm mb-6 tracking-widest uppercase">Legalitas</h4>
            <ul className="space-y-4 text-[var(--text-2)] font-medium text-sm">
              <li><Link to="/help" className="hover:text-[var(--primary)] transition-colors">Pusat Bantuan</Link></li>
              <li><a href="#" className="hover:text-[var(--primary)] transition-colors">Status Operasional</a></li>
              <li><Link to="/app/privacy" className="hover:text-[var(--primary)] transition-colors">Kebijakan Privasi</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-[var(--border)] pt-8 flex flex-col md:flex-row items-center justify-between text-[var(--text-3)] text-xs font-semibold tracking-wide">
          <p>© {new Date().getFullYear()} Xamina Technologies. Hak Cipta Dilindungi.</p>
          <p className="mt-4 md:mt-0">Powered By Onthesis.</p>
        </div>
      </footer>
    </div>
  );
}