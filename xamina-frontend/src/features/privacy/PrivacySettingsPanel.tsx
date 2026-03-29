import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { errorMessageForCode } from "@/lib/axios";
import { saveBlobAsFile } from "@/lib/file-download";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/store/toast.store";

import { privacyApi } from "./privacy.api";

type ExportSummary = {
  generated_at: string;
  sessions: number;
  submissions: number;
  notifications: number;
  certificates: number;
};

function normalizeReasonCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function labelSecurityEvent(eventType: string) {
  switch (eventType) {
    case "challenge_verified":
      return "OTP verified";
    case "challenge_required":
      return "Challenge required";
    case "failed_password":
      return "Failed password";
    case "otp_failed":
      return "OTP failed";
    case "success":
      return "Login success";
    default:
      return eventType;
  }
}

export function PrivacySettingsPanel() {
  const user = useAuthStore((state) => state.user);
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);
  const [lastExport, setLastExport] = useState<ExportSummary | null>(null);

  const deletionQuery = useQuery({
    queryKey: ["privacy-delete-request"],
    queryFn: () => privacyApi.getDeletionRequest(),
  });

  const securityQuery = useQuery({
    queryKey: ["privacy-security-settings"],
    queryFn: () => privacyApi.getSecuritySettings(),
  });

  useEffect(() => {
    if (typeof securityQuery.data?.email_otp_enabled === "boolean") {
      setEmailOtpEnabled(securityQuery.data.email_otp_enabled);
    }
  }, [securityQuery.data?.email_otp_enabled]);

  const exportMutation = useMutation({
    mutationFn: () => privacyApi.exportMyData(),
    onSuccess: (payload) => {
      const safeEmail = payload.user.email.replace(/[^a-z0-9._-]+/gi, "_");
      const datePart = payload.generated_at.slice(0, 10);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      saveBlobAsFile(blob, `xamina-privacy-export-${safeEmail}-${datePart}.json`);
      setLastExport({
        generated_at: payload.generated_at,
        sessions: payload.sessions.length,
        submissions: payload.submissions.length,
        notifications: payload.notifications.length,
        certificates: payload.certificates.length,
      });
      toast.success("Ekspor data berhasil diunduh.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal menyiapkan ekspor data."));
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: () =>
      privacyApi.createDeletionRequest({
        reason: reason.trim() || undefined,
      }),
    onSuccess: async () => {
      setReason("");
      await qc.invalidateQueries({ queryKey: ["privacy-delete-request"] });
      toast.success("Permintaan penghapusan akun berhasil dikirim.");
    },
    onError: (error) => {
      toast.error(
        errorMessageForCode(
          error,
          {
            DELETE_REQUEST_EXISTS: "Masih ada permintaan penghapusan akun yang belum diproses.",
          },
          "Gagal mengirim permintaan penghapusan akun.",
        ),
      );
    },
  });

  const securityMutation = useMutation({
    mutationFn: () =>
      privacyApi.updateSecuritySettings({
        email_otp_enabled: emailOtpEnabled,
        current_password: currentPassword,
      }),
    onSuccess: async (payload) => {
      setCurrentPassword("");
      setEmailOtpEnabled(payload.email_otp_enabled);
      await qc.invalidateQueries({ queryKey: ["privacy-security-settings"] });
      toast.success("Pengaturan keamanan berhasil diperbarui.");
    },
    onError: (error) => {
      toast.error(
        errorMessageForCode(
          error,
          {
            INVALID_PASSWORD: "Password saat ini tidak valid.",
          },
          "Gagal menyimpan pengaturan keamanan.",
        ),
      );
    },
  });

  const currentRequest = deletionQuery.data;
  const pendingDelete = currentRequest?.status === "pending";

  const recentEvents = securityQuery.data?.recent_events ?? [];
  const lastSuspiciousEvent = useMemo(
    () =>
      recentEvents.find((event) => {
        const reasons = normalizeReasonCodes(event.reason_codes_jsonb);
        return event.risk_level !== "low" || reasons.length > 0;
      }),
    [recentEvents],
  );
  const lastOtpVerification = useMemo(
    () => recentEvents.find((event) => event.event_type === "challenge_verified"),
    [recentEvents],
  );

  return (
    <section className="panel-grid">
      <section className="card">
        <p className="section-eyebrow">Security & Compliance</p>
        <h2 className="section-title">Privacy Settings</h2>
        <p className="state-text">
          Kelola ekspor data pribadi, penghapusan akun, dan proteksi login email OTP dari
          workspace aktif.
        </p>
      </section>

      <section className="metric-grid">
        <div className="card stat-card card-muted">
          <p className="stat-label">Account</p>
          <h3 className="metric-value">{user?.name ?? "-"}</h3>
          <p className="stat-trend">{user?.email ?? "-"}</p>
        </div>
        <div className="card stat-card card-muted">
          <p className="stat-label">Role</p>
          <h3 className="metric-value" style={{ textTransform: "capitalize" }}>
            {user?.role ?? "-"}
          </h3>
          <p className="stat-trend">Hak akses aktif pada tenant saat ini.</p>
        </div>
        <div className="card stat-card card-muted">
          <p className="stat-label">Delete Request</p>
          <h3 className="metric-value">{currentRequest?.status ?? "none"}</h3>
          <p className="stat-trend">
            {currentRequest
              ? `Terakhir diajukan ${new Date(currentRequest.requested_at).toLocaleString("id-ID")}`
              : "Belum ada permintaan penghapusan akun."}
          </p>
        </div>
      </section>

      <section className="card">
        <p className="section-eyebrow">Login Protection</p>
        <h3 className="section-title-sm">Always require Email OTP</h3>
        <p className="state-text">
          Aktifkan agar setiap login selalu lewat challenge OTP email. Login berisiko tetap akan
          dipaksa challenge walau toggle ini dimatikan.
        </p>

        <label className="row gap-sm" style={{ marginTop: 18, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={emailOtpEnabled}
            onChange={(event) => setEmailOtpEnabled(event.target.checked)}
            disabled={securityQuery.isLoading || securityMutation.isPending}
          />
          <span className="state-text">
            {emailOtpEnabled ? "Email OTP wajib di setiap login." : "Email OTP hanya saat login berisiko."}
          </span>
        </label>

        <label className="form-field" style={{ marginTop: 16 }}>
          <span className="form-label">Password saat ini</span>
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Masukkan password saat ini untuk konfirmasi"
            disabled={securityMutation.isPending}
          />
        </label>

        <div className="row gap-sm" style={{ marginTop: 16, alignItems: "center" }}>
          <button
            className="btn"
            onClick={() => securityMutation.mutate()}
            disabled={securityMutation.isPending || !currentPassword.trim()}
          >
            {securityMutation.isPending ? "Saving..." : "Save Security Settings"}
          </button>
          <p className="state-text">
            {securityQuery.isLoading
              ? "Memuat pengaturan keamanan..."
              : securityQuery.data?.email_otp_enabled
                ? "Status aktif: selalu minta OTP."
                : "Status aktif: OTP hanya untuk challenge berisiko."}
          </p>
        </div>

        <div className="grid-3" style={{ marginTop: 20 }}>
          <div className="surface-muted">
            <strong>Last risky login</strong>
            <p className="state-text">
              {lastSuspiciousEvent
                ? `${new Date(lastSuspiciousEvent.created_at).toLocaleString("id-ID")}`
                : "Belum ada event risiko yang terekam."}
            </p>
          </div>
          <div className="surface-muted">
            <strong>Last OTP verification</strong>
            <p className="state-text">
              {lastOtpVerification
                ? new Date(lastOtpVerification.created_at).toLocaleString("id-ID")
                : "Belum ada verifikasi OTP."}
            </p>
          </div>
          <div className="surface-muted">
            <strong>Recent events</strong>
            <p className="state-text">{recentEvents.length} event keamanan terbaru tersedia.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="section-eyebrow">Security Activity</p>
        <h3 className="section-title-sm">Riwayat login & challenge terbaru</h3>
        {securityQuery.isLoading ? <p className="state-text">Memuat activity keamanan...</p> : null}
        {securityQuery.isError ? (
          <p className="state-text error">
            {errorMessageForCode(securityQuery.error, {}, "Gagal memuat activity keamanan.")}
          </p>
        ) : null}
        {!securityQuery.isLoading && recentEvents.length === 0 ? (
          <p className="state-text">Belum ada activity keamanan yang tercatat untuk akun ini.</p>
        ) : null}
        <div className="panel-grid" style={{ marginTop: 16 }}>
          {recentEvents.map((event) => {
            const reasons = normalizeReasonCodes(event.reason_codes_jsonb);
            return (
              <div key={event.id} className="surface-muted">
                <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                  <strong>{labelSecurityEvent(event.event_type)}</strong>
                  <span className="state-text" style={{ textTransform: "uppercase" }}>
                    {event.risk_level}
                  </span>
                </div>
                <p className="state-text">
                  {new Date(event.created_at).toLocaleString("id-ID")}
                </p>
                <p className="state-text">IP: {event.ip_address ?? "-"}</p>
                <p className="state-text">
                  User-Agent: {event.user_agent?.slice(0, 80) ?? "-"}
                </p>
                <p className="state-text">
                  Reason: {reasons.length > 0 ? reasons.join(", ") : "no risk flags"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <p className="section-eyebrow">Data Export</p>
        <h3 className="section-title-sm">Unduh snapshot data pribadi</h3>
        <p className="state-text">
          File JSON akan memuat profil akun, riwayat sesi login, submission ujian, notifikasi, dan
          sertifikat yang sudah terbit untuk akun aktif Anda.
        </p>
        <div className="grid-3" style={{ marginTop: 16 }}>
          <div className="surface-muted">
            <strong>Identity</strong>
            <p className="state-text">Profil akun, tenant, role, dan informasi kelas.</p>
          </div>
          <div className="surface-muted">
            <strong>Activity</strong>
            <p className="state-text">Riwayat refresh session, submission, dan notifikasi.</p>
          </div>
          <div className="surface-muted">
            <strong>Achievement</strong>
            <p className="state-text">Metadata sertifikat dan status deletion request terakhir.</p>
          </div>
        </div>
        <div className="row gap-sm" style={{ marginTop: 20, alignItems: "center" }}>
          <button
            className="btn"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? "Preparing export..." : "Download My Data"}
          </button>
          {lastExport ? (
            <p className="state-text">
              Snapshot {new Date(lastExport.generated_at).toLocaleString("id-ID")} | sessions{" "}
              {lastExport.sessions} | submissions {lastExport.submissions} | notifications{" "}
              {lastExport.notifications} | certificates {lastExport.certificates}
            </p>
          ) : null}
        </div>
      </section>

      <section className="card">
        <p className="section-eyebrow">Account Deletion</p>
        <h3 className="section-title-sm">Ajukan penghapusan akun</h3>
        <p className="state-text">
          Permintaan akan disimpan sebagai tiket compliance agar ada jejak audit dan review
          operasional sebelum tindakan destruktif dilakukan.
        </p>

        <label className="form-field" style={{ marginTop: 16 }}>
          <span className="form-label">Alasan penghapusan akun</span>
          <textarea
            className="input"
            rows={5}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: tenant sudah tidak digunakan lagi dan akun ingin ditutup permanen."
            disabled={pendingDelete || deleteRequestMutation.isPending}
          />
        </label>

        <div className="row gap-sm" style={{ marginTop: 16, alignItems: "center" }}>
          <button
            className="btn btn-danger"
            onClick={() => deleteRequestMutation.mutate()}
            disabled={pendingDelete || deleteRequestMutation.isPending}
          >
            {deleteRequestMutation.isPending ? "Submitting..." : "Request Account Deletion"}
          </button>
          <p className="state-text">
            {pendingDelete
              ? "Permintaan pending sudah ada. Tunggu review tim operasional."
              : "Tidak ada penghapusan otomatis di batch ini."}
          </p>
        </div>

        <div className="surface-muted" style={{ marginTop: 20 }}>
          <strong>Status Saat Ini</strong>
          {deletionQuery.isLoading ? (
            <p className="state-text">Memuat status penghapusan akun...</p>
          ) : null}
          {deletionQuery.isError ? (
            <p className="state-text error">
              {errorMessageForCode(deletionQuery.error, {}, "Gagal memuat status penghapusan akun.")}
            </p>
          ) : null}
          {!deletionQuery.isLoading && !currentRequest ? (
            <p className="state-text">Belum ada deletion request untuk akun ini.</p>
          ) : null}
          {currentRequest ? (
            <>
              <p className="state-text">Status: {currentRequest.status}</p>
              <p className="state-text">
                Requested: {new Date(currentRequest.requested_at).toLocaleString("id-ID")}
              </p>
              {currentRequest.reason ? (
                <p className="state-text">Reason: {currentRequest.reason}</p>
              ) : null}
              {currentRequest.notes ? (
                <p className="state-text">Notes: {currentRequest.notes}</p>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </section>
  );
}
