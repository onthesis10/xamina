import { Link } from "@tanstack/react-router";

export function LandingPage() {
  return (
    <main className="landing">
      <div className="landing-card">
        <p className="section-eyebrow">Xamina CBT Platform</p>
        <h1 className="landing-title">
          CBT sekolah yang siap produksi, multi-tenant, dan sudah punya billing SaaS.
        </h1>
        <p className="state-text">
          Platform CBT multi-role untuk sekolah dengan alur guru, siswa, admin tenant, dan super
          admin dalam satu workspace yang konsisten.
        </p>
        <div className="landing-actions">
          <Link className="btn" to="/auth/login">
            Masuk ke Dashboard
          </Link>
          <Link className="btn btn-ghost" to="/pricing">
            Lihat Pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
