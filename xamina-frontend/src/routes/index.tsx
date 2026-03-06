import { Link } from "@tanstack/react-router";

export function LandingPage() {
  return (
    <main className="landing">
      <div className="landing-card">
        <h1>Xamina MVP</h1>
        <p>Platform CBT multi-role untuk sekolah.</p>
        <Link className="btn" to="/auth/login">Masuk ke Dashboard</Link>
      </div>
    </main>
  );
}
