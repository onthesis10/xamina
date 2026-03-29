import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CircleAlert,
  CircleCheckBig,
  Layers3,
  Palette,
  PanelsTopLeft,
  Sparkles,
  Users,
} from "lucide-react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";

type SectionId = "overview" | "logo" | "colors" | "typography" | "spacing" | "components" | "modes";

const navItems: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "logo", label: "Logo System" },
  { id: "colors", label: "Color Palette" },
  { id: "typography", label: "Typography" },
  { id: "spacing", label: "Spacing & Grid" },
  { id: "components", label: "All Components" },
  { id: "modes", label: "Light / Dark / Fun" },
];

const palette = [
  { label: "Primary", color: "#FF6B00" },
  { label: "Primary 2", color: "#FF8C35" },
  { label: "Primary 3", color: "#FFB066" },
  { label: "Accent", color: "#7C3AED" },
  { label: "Info", color: "#2563EB" },
];

const tokens = [
  { name: "Dark BG", hex: "#0F0800", bg: "#0F0800", fg: "#FF7A1A" },
  { name: "Light BG", hex: "#FDFAF6", bg: "#FDFAF6", fg: "#9C7A58", border: "1px solid #EAE0D4" },
  { name: "Primary", hex: "#FF6B00", bg: "#FF6B00", fg: "#FFF4E8" },
  { name: "Success", hex: "#16A34A", bg: "#16A34A", fg: "#FFFFFF" },
  { name: "Warning", hex: "#CA8A04", bg: "#CA8A04", fg: "#FFFFFF" },
  { name: "Danger", hex: "#DC2626", bg: "#DC2626", fg: "#FFFFFF" },
  { name: "Info", hex: "#2563EB", bg: "#2563EB", fg: "#FFFFFF" },
  { name: "Violet", hex: "#7C3AED", bg: "#7C3AED", fg: "#FFFFFF" },
  { name: "Teal", hex: "#0D9488", bg: "#0D9488", fg: "#FFFFFF" },
];

const spacingScale = [
  { label: "01", value: "4px", width: "8%", desc: "micro spacing" },
  { label: "02", value: "8px", width: "14%", desc: "tight stacks" },
  { label: "03", value: "12px", width: "22%", desc: "card internals" },
  { label: "04", value: "16px", width: "30%", desc: "default gap" },
  { label: "05", value: "24px", width: "42%", desc: "section spacing" },
  { label: "06", value: "32px", width: "54%", desc: "hero and shell" },
  { label: "07", value: "40px", width: "68%", desc: "major separation" },
  { label: "08", value: "48px", width: "82%", desc: "page rhythm" },
];

export function DesignSystemPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");

  useEffect(() => {
    document.title = "Xamina Design System";
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries.find((entry) => entry.isIntersecting);
        if (visibleEntry?.target.id) {
          setActiveSection(visibleEntry.target.id as SectionId);
        }
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0.1 },
    );

    navItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const currentLabel = useMemo(
    () => navItems.find((item) => item.id === activeSection)?.label ?? "Overview",
    [activeSection],
  );

  return (
    <div className="design-system-shell">
      <aside className="design-system-sidebar">
        <div className="brand">
          <BrandLogo badge="Xamina v1.0" tagline="Living design system untuk seluruh surface frontend." />
        </div>

        <nav className="side-nav">
          <p className="brand-badge">Fondasi</p>
          {navItems.slice(0, 5).map((item) => (
            <a key={item.id} href={`#${item.id}`} className={activeSection === item.id ? "side-link active" : "side-link"}>
              {item.label}
            </a>
          ))}
          <p className="brand-badge" style={{ marginTop: 8 }}>Komponen</p>
          <a href="#components" className={activeSection === "components" ? "side-link active" : "side-link"}>
            All Components
          </a>
          <p className="brand-badge" style={{ marginTop: 8 }}>Mode</p>
          <a href="#modes" className={activeSection === "modes" ? "side-link active" : "side-link"}>
            Light / Dark / Fun
          </a>
        </nav>
      </aside>

      <main className="design-system-main">
        <div className="design-system-topbar">
          <div className="design-system-breadcrumb">
            <span>Xamina</span>
            <span>/</span>
            <span>Design System</span>
            <span>/</span>
            <span className="current">{currentLabel}</span>
          </div>
          <div className="badge badge-orange">Living Spec</div>
          <ThemeModeToggle compact className="ml-auto" />
        </div>

        <div className="design-system-content">
          <section id="overview" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">Overview</div>
              <h1 className="section-title">
                Sistem visual <em>Xamina</em>
                <br />
                yang hangat, presisi, dan siap produksi
              </h1>
              <p className="section-desc">
                Referensi ini menjadi sumber utama typography, warna, spacing, dan komponen lintas halaman.
                Seluruh UI app harus turun dari sistem ini sebelum Sprint 13 berjalan.
              </p>
            </header>

            <div className="design-overview-grid">
              <article className="card stat-card">
                <div className="stat-card-head">
                  <div>
                    <p className="stat-label">Foundations</p>
                    <h3 className="metric-value">3</h3>
                  </div>
                  <div className="stat-icon">
                    <Layers3 size={20} />
                  </div>
                </div>
                <p className="stat-trend">Color, typography, dan spacing dipakai konsisten pada semua route.</p>
              </article>

              <article className="card stat-card">
                <div className="stat-card-head">
                  <div>
                    <p className="stat-label">Components</p>
                    <h3 className="metric-value">12+</h3>
                  </div>
                  <div className="stat-icon" style={{ background: "var(--info-bg)", color: "var(--info)" }}>
                    <PanelsTopLeft size={20} />
                  </div>
                </div>
                <p className="stat-trend">Buttons, badges, cards, forms, tables, toasts, dialogs, dan mode preview.</p>
              </article>

              <article className="card stat-card">
                <div className="stat-card-head">
                  <div>
                    <p className="stat-label">Theme Modes</p>
                    <h3 className="metric-value">3</h3>
                  </div>
                  <div className="stat-icon" style={{ background: "var(--violet-bg)", color: "var(--violet)" }}>
                    <Palette size={20} />
                  </div>
                </div>
                <p className="stat-trend">Light, Dark, dan Fun berjalan pada token runtime yang sama.</p>
              </article>
            </div>
          </section>

          <section id="logo" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">Logo System</div>
              <h2 className="section-title">Identitas merek yang konsisten di semua mode</h2>
              <p className="section-desc">Wordmark dan symbol harus tampil utuh di permukaan terang, gelap, dan aksen.</p>
            </header>

            <div className="logo-grid">
              <div className="logo-card bg-light">
                <PreviewLogo textColor="#1C0F00" accentColor="#FF6B00" />
                <div className="logo-card-label">Full — Light Background</div>
              </div>
              <div className="logo-card bg-dark">
                <PreviewLogo textColor="#FFF4E8" accentColor="#FF7A1A" />
                <div className="logo-card-label" style={{ color: "rgba(255,244,232,0.5)" }}>Full — Dark Background</div>
              </div>
              <div className="logo-card bg-orange">
                <PreviewLogo textColor="#FFF4E8" accentColor="#FFF4E8" />
                <div className="logo-card-label" style={{ color: "rgba(255,244,232,0.7)" }}>Accent Surface</div>
              </div>
            </div>
          </section>

          <section id="colors" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">Color Palette</div>
              <h2 className="section-title">Warm academic palette dengan aksen yang tegas</h2>
              <p className="section-desc">Palet utama dibangun dari cream, orange, dan aksen fungsional yang tetap terbaca kuat.</p>
            </header>

            <div className="palette-row">
              {palette.map((item) => (
                <div key={item.label} className="palette-swatch" style={{ background: item.color }}>
                  <span className="swatch-label">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="token-grid">
              {tokens.map((item) => (
                <div key={item.name} className="token-card">
                  <div className="token-swatch" style={{ background: item.bg, color: item.fg, border: item.border }}>
                    {item.name}
                  </div>
                  <div className="token-info">
                    <div className="token-name">{item.name}</div>
                    <div className="token-hex">{item.hex}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="typography" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">Typography System</div>
              <h2 className="section-title">Display serif, sans UI, dan mono untuk data</h2>
              <p className="section-desc">Fraunces memimpin hierarchy display, Plus Jakarta Sans menjaga keluwesan UI, dan JetBrains Mono menegaskan data.</p>
            </header>

            <div className="type-grid">
              <article className="type-specimen">
                <div className="type-meta">
                  <span className="type-badge">Display</span>
                  <span className="state-text">Fraunces • serif editorial untuk headings</span>
                </div>
                <div className="type-scale">
                  <div className="type-row">
                    <div className="type-label">H1</div>
                    <div className="type-sample landing-title" style={{ fontSize: "52px" }}>Xamina Design</div>
                    <div className="type-detail">52 / 900</div>
                  </div>
                  <div className="type-row">
                    <div className="type-label">H2</div>
                    <div className="type-sample section-title" style={{ margin: 0, fontSize: "34px" }}>Refined Workspace</div>
                    <div className="type-detail">34 / 900</div>
                  </div>
                  <div className="type-row">
                    <div className="type-label">H3</div>
                    <div className="type-sample" style={{ fontFamily: "Fraunces, serif", fontSize: "24px", fontWeight: 800 }}>Metric Surfaces</div>
                    <div className="type-detail">24 / 800</div>
                  </div>
                </div>
              </article>

              <article className="type-specimen">
                <div className="type-meta">
                  <span className="type-badge">UI</span>
                  <span className="state-text">Plus Jakarta Sans & JetBrains Mono untuk interface dan data</span>
                </div>
                <div className="type-scale">
                  <div className="type-row">
                    <div className="type-label">Body</div>
                    <div className="type-sample" style={{ fontSize: "14px" }}>Platform CBT yang rapi, ringan, dan siap dipakai sekolah modern.</div>
                    <div className="type-detail">14 / 400</div>
                  </div>
                  <div className="type-row">
                    <div className="type-label">Label</div>
                    <div className="type-sample form-label">Tenant Quota</div>
                    <div className="type-detail">11 / 700</div>
                  </div>
                  <div className="type-row">
                    <div className="type-label">Mono</div>
                    <div className="type-sample text-mono">CERT-20260305-ABCD1234</div>
                    <div className="type-detail">11 / 600</div>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section id="spacing" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">Spacing & Grid</div>
              <h2 className="section-title">Ritme 4px dan layout grid yang stabil</h2>
              <p className="section-desc">Base unit 4px dipakai untuk semua spacing. Grid responsif menjaga struktur halaman tetap rapi.</p>
            </header>

            <div className="card">
              <div className="spacing-showcase">
                {spacingScale.map((item) => (
                  <div key={item.label} className="spacing-row">
                    <div className="spacing-label">{item.label}</div>
                    <div className="spacing-bar" style={{ width: item.width }} />
                    <div className="spacing-val">{item.value}</div>
                    <div className="state-text">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="components" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">All Components</div>
              <h2 className="section-title">Komponen yang dipakai nyata di seluruh app</h2>
              <p className="section-desc">Semua komponen harus responsif terhadap perubahan mode Light, Dark, dan Fun melalui token runtime yang sama.</p>
            </header>

            <div className="component-showcase">
              <div className="comp-section">
                <div className="comp-label">Buttons</div>
                <div className="comp-row">
                  <button className="btn btn-primary"><Sparkles size={14} /> Generate Soal</button>
                  <button className="btn btn-secondary">Buat Ujian</button>
                  <button className="btn btn-ghost">Lihat Detail</button>
                  <button className="btn btn-success"><CircleCheckBig size={14} /> Selesai</button>
                  <button className="btn btn-danger">Hapus</button>
                </div>
              </div>

              <div className="comp-section">
                <div className="comp-label">Badges & Status</div>
                <div className="comp-row">
                  <span className="badge badge-orange">Enterprise</span>
                  <span className="badge badge-green">Selesai</span>
                  <span className="badge badge-yellow">Pending</span>
                  <span className="badge badge-red">Gagal</span>
                  <span className="badge" style={{ background: "var(--info-bg)", color: "var(--info)", borderColor: "color-mix(in srgb, var(--info) 20%, transparent)" }}>Active</span>
                  <span className="badge" style={{ background: "var(--violet-bg)", color: "var(--violet)", borderColor: "color-mix(in srgb, var(--violet) 20%, transparent)" }}>AI Pro</span>
                </div>
              </div>

              <div className="comp-section">
                <div className="comp-label">Form Inputs</div>
                <div className="comp-row">
                  <div style={{ width: "220px" }}>
                    <label className="form-label">Nama Siswa</label>
                    <input className="input" placeholder="Masukkan nama lengkap..." />
                  </div>
                  <div style={{ width: "220px" }}>
                    <label className="form-label">Cari Soal</label>
                    <input className="input" placeholder="Keyword soal..." />
                  </div>
                  <div style={{ width: "220px" }}>
                    <label className="form-label">Durasi Ujian</label>
                    <select className="input" defaultValue="90">
                      <option value="90">90 Menit</option>
                      <option value="60">60 Menit</option>
                      <option value="45">45 Menit</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="comp-section">
                <div className="comp-label">Stat Cards</div>
                <div className="surface-grid">
                  <article className="card stat-card">
                    <div className="stat-card-head">
                      <div className="stat-icon"><Users size={18} /></div>
                    </div>
                    <div className="metric-value">1,240</div>
                    <div className="stat-label">Total Siswa</div>
                    <div className="stat-trend trend-up">↑ 12% bulan ini</div>
                  </article>
                  <article className="card stat-card">
                    <div className="stat-card-head">
                      <div className="stat-icon" style={{ background: "var(--success-bg)", color: "var(--success)" }}><CircleCheckBig size={18} /></div>
                    </div>
                    <div className="metric-value" style={{ color: "var(--success)" }}>94.2%</div>
                    <div className="stat-label">Pass Rate</div>
                    <div className="stat-trend trend-up">↑ 5% dari semester lalu</div>
                  </article>
                  <article className="card stat-card">
                    <div className="stat-card-head">
                      <div className="stat-icon" style={{ background: "var(--violet-bg)", color: "var(--violet)" }}><Sparkles size={18} /></div>
                    </div>
                    <div className="metric-value">340</div>
                    <div className="stat-label">Soal AI Generated</div>
                    <div className="stat-trend" style={{ color: "var(--violet)" }}>✨ AI powered</div>
                  </article>
                </div>
              </div>

              <div className="comp-section">
                <div className="comp-label">Avatars & Progress</div>
                <div className="comp-row" style={{ justifyContent: "space-between", width: "100%" }}>
                  <div className="avatar-stack">
                    <span className="avatar">AP</span>
                    <span className="avatar" style={{ background: "var(--info-bg)", color: "var(--info)" }}>BK</span>
                    <span className="avatar" style={{ background: "var(--success-bg)", color: "var(--success)" }}>CW</span>
                    <span className="avatar" style={{ background: "var(--bg-2)", color: "var(--text-1)" }}>+8</span>
                  </div>
                  <div style={{ minWidth: "240px", display: "grid", gap: 8 }}>
                    <div className="quota-label"><span>Matematika XII IPA 1</span><span className="text-mono">88%</span></div>
                    <div className="progress-bar"><div style={{ width: "88%" }} /></div>
                  </div>
                </div>
              </div>

              <div className="comp-section">
                <div className="comp-label">Toasts</div>
                <div className="comp-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div className="toast-row toast-success"><span>Ujian berhasil dipublikasi.</span><CircleCheckBig size={16} /></div>
                  <div className="toast-row toast-error"><span>Koneksi terputus, jawaban akan disimpan lokal.</span><CircleAlert size={16} /></div>
                  <div className="toast-row toast-info"><span>Ujian dimulai pukul 08.00. Pastikan perangkat siap.</span><BellRing size={16} /></div>
                </div>
              </div>

              <div className="comp-section">
                <div className="comp-label">Table</div>
                <div className="card">
                  <div className="table-wrap">
                    <table className="x-table">
                      <thead>
                        <tr>
                          <th>Nama Siswa</th>
                          <th>Kelas</th>
                          <th>Nilai</th>
                          <th>Waktu</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Andi Prasetyo</td>
                          <td>XII IPA 1</td>
                          <td style={{ color: "var(--success)", fontWeight: 700 }}>92</td>
                          <td className="text-mono">78:24</td>
                          <td><span className="badge badge-green">Selesai</span></td>
                        </tr>
                        <tr>
                          <td>Bela Kusuma</td>
                          <td>XII IPA 1</td>
                          <td style={{ color: "var(--primary)", fontWeight: 700 }}>88</td>
                          <td className="text-mono">85:12</td>
                          <td><span className="badge badge-green">Selesai</span></td>
                        </tr>
                        <tr>
                          <td>Candra Wijaya</td>
                          <td>XII IPA 2</td>
                          <td style={{ color: "var(--warning)", fontWeight: 700 }}>74</td>
                          <td className="text-mono">89:55</td>
                          <td><span className="badge badge-yellow">Review</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="modes" className="section-shell">
            <header className="section-header">
              <div className="section-eyebrow">Theme Modes</div>
              <h2 className="section-title">Light, Dark, dan <em>Fun Mode</em></h2>
              <p className="section-desc">Tiga mode berjalan dari CSS custom properties yang sama tanpa mengubah kontrak komponen.</p>
            </header>

            <div className="mode-preview-grid">
              <ModePreview title="☀️ Light Mode" description="Warm cream base · akademik & profesional" mode="light" />
              <ModePreview title="🌙 Dark Mode" description="Kontras tinggi · fokus panjang" mode="dark" />
              <ModePreview title="🎨 Fun Mode" description="Lebih ekspresif · tetap terstruktur" mode="fun" />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ModePreview({
  title,
  description,
  mode,
}: {
  title: string;
  description: string;
  mode: "light" | "dark" | "fun";
}) {
  const previewStyle =
    mode === "dark"
      ? { background: "#0D0700", borderColor: "#3D2810" }
      : mode === "fun"
        ? { background: "#FFF8F0", borderColor: "#FFB870" }
        : { background: "#FDFAF6", borderColor: "#EAE0D4" };

  const cardStyle =
    mode === "dark"
      ? { background: "#1A1003", borderColor: "#2A1A08", color: "#FFF4E8" }
      : mode === "fun"
        ? { background: "#FFFFFF", borderColor: "#FFD4A8", color: "#1A0800" }
        : { background: "#FFFFFF", borderColor: "#EAE0D4", color: "#1C0F00" };

  const footerStyle =
    mode === "dark"
      ? { background: "#130B01", color: "#FFF4E8" }
      : mode === "fun"
        ? { background: "#FFF0E0", color: "#1A0800" }
        : { background: "#F8F3EC", color: "#1C0F00" };

  return (
    <article className="preview-card" style={{ ...previewStyle, borderWidth: 2 }}>
      <div className="preview-card-body" style={previewStyle}>
        <PreviewLogo
          textColor={mode === "dark" ? "#FFF4E8" : "#1C0F00"}
          accentColor={mode === "dark" ? "#FF7A1A" : mode === "fun" ? "#FF4500" : "#FF6B00"}
        />
        <div className="surface-muted" style={cardStyle}>
          <p className="surface-kicker">TOTAL SISWA</p>
          <div className="metric-value" style={{ marginBottom: 6 }}>1,240</div>
          <div className="stat-trend trend-up">↑ 12% bulan ini</div>
        </div>
        <button className="btn btn-primary"><Sparkles size={14} /> Generate Soal</button>
      </div>
      <div className="preview-card-footer" style={footerStyle}>
        <div style={{ fontWeight: 800, fontSize: 11 }}>{title}</div>
        <div style={{ fontSize: 10, opacity: 0.8 }}>{description}</div>
      </div>
    </article>
  );
}

function PreviewLogo({ textColor, accentColor }: { textColor: string; accentColor: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: "linear-gradient(135deg,#FF5500,#FF9A3C)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 40 40" fill="none">
          <path d="M11 11L20 20M20 20L29 11M20 20L11 29M20 20L29 29" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="3" fill="white" />
        </svg>
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontWeight: 900, fontSize: 22, color: textColor, letterSpacing: "-0.03em" }}>
        Xamin<span style={{ color: accentColor }}>a</span>
      </div>
    </div>
  );
}
