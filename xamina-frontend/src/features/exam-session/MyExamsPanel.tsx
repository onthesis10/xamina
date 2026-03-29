import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { StudentExamListItem } from "@/types/api.types";

import { sessionApi } from "./session.api";

type StudentExamTableRow = StudentExamListItem & { id: string };

export function MyExamsPanel() {
  const navigate = useNavigate();
  const toast = useToast();
  const examsQuery = useQuery({
    queryKey: ["student-my-exams"],
    queryFn: () => sessionApi.listMyExams(),
    refetchInterval: 15_000,
  });

  const startMutation = useMutation({
    mutationFn: (examId: string) => sessionApi.startExam(examId),
    onSuccess: (result) => {
      toast.success("Sesi ujian dimulai.");
      navigate({ to: "/app/my-exams/session/$submissionId", params: { submissionId: result.submission_id } });
    },
    onError: (error) => {
      toast.error(
        errorMessageForCode(
          error,
          {
            EXAM_NOT_AVAILABLE: "Ujian belum tersedia untuk dikerjakan saat ini.",
            ATTEMPT_FINALIZED: "Attempt sudah final dan tidak bisa dimulai ulang.",
          },
          "Gagal memulai sesi ujian.",
        ),
      );
    },
  });

  const rows: StudentExamTableRow[] = (examsQuery.data ?? []).map((item) => ({ ...item, id: item.exam_id }));

  return (
    <section className="panel-grid">
      <section className="page-hero card">
        <div className="page-hero-copy">
          <p className="section-eyebrow">Student Workspace</p>
          <h2 className="section-title">Semua ujian aktif dalam satu alur yang lebih tenang dan jelas</h2>
          <p className="section-desc">
            Daftar ini menampilkan jadwal, status progress, dan aksi utama untuk memulai atau melanjutkan ujian tanpa kebingungan.
          </p>
        </div>
        <div className="metric-grid mixed">
          <section className="card stat-card card-muted">
            <p className="stat-label">Available Exams</p>
            <h3 className="metric-value">{rows.length}</h3>
            <p className="stat-trend">Semua exam yang relevan dengan akun siswa aktif.</p>
          </section>
        </div>
      </section>

      <DataTable
        title="Ujian Saya"
        rows={rows}
        loading={examsQuery.isLoading}
        error={
          examsQuery.isError
            ? errorMessageForCode(
                examsQuery.error,
                {
                  FORBIDDEN: "Akses ditolak untuk melihat daftar ujian siswa.",
                },
                "Gagal memuat daftar ujian.",
              )
            : null
        }
        emptyLabel="Belum ada ujian published untuk tenant ini."
        columns={[
          { key: "title", header: "Ujian", render: (row: StudentExamTableRow) => row.title },
          {
            key: "window",
            header: "Jadwal",
            render: (row: StudentExamTableRow) =>
              row.start_at && row.end_at
                ? `${new Date(row.start_at).toLocaleString()} - ${new Date(row.end_at).toLocaleString()}`
                : "Belum dijadwalkan",
          },
          { key: "duration", header: "Durasi", render: (row: StudentExamTableRow) => `${row.duration_minutes} menit` },
          {
            key: "status",
            header: "Progress",
            render: (row: StudentExamTableRow) =>
              row.submission_status === "not_started" ? (
                <span className="pill p-neu">Not Started</span>
              ) : (
                <StatusBadge value={row.submission_status} />
              ),
          },
          {
            key: "action",
            header: "Aksi",
            render: (row: StudentExamTableRow) => {
              if (row.submission_status === "finished" && row.submission_id) {
                return (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      navigate({
                        to: "/app/my-exams/result/$submissionId",
                        params: { submissionId: row.submission_id! },
                      })
                    }
                  >
                    Lihat Hasil
                  </button>
                );
              }

              return (
                <button
                  className="btn"
                  disabled={!row.can_start || startMutation.isPending}
                  onClick={() => startMutation.mutate(row.exam_id)}
                >
                  {row.submission_status === "in_progress" ? "Resume" : "Start"}
                </button>
              );
            },
          },
        ]}
      />
      {startMutation.isError ? (
        <p className="state-text error">
          {errorMessageForCode(
            startMutation.error,
            {
              EXAM_NOT_AVAILABLE: "Ujian belum tersedia untuk dikerjakan saat ini.",
              ATTEMPT_FINALIZED: "Attempt sudah final dan tidak bisa dimulai ulang.",
            },
            "Gagal memulai sesi ujian.",
          )}
        </p>
      ) : null}
    </section>
  );
}
