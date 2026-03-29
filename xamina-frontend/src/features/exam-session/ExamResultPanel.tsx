import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { DataTable } from "@/components/DataTable";
import { certificateApi } from "@/features/analytics/analytics.api";
import { errorMessageForCode } from "@/lib/axios";
import { downloadPublicAssetFile, saveBlobAsFile } from "@/lib/file-download";
import { useToast } from "@/store/toast.store";
import type { SubmissionResultItem } from "@/types/api.types";

import { sessionApi } from "./session.api";

type ResultTableRow = SubmissionResultItem & { id: string };

export function ExamResultPanel({ submissionId }: { submissionId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const resultQuery = useQuery({
    queryKey: ["submission-result", submissionId],
    queryFn: () => sessionApi.getResult(submissionId),
  });
  const certQuery = useQuery({
    queryKey: ["submission-certificate", submissionId],
    enabled: !!resultQuery.data?.passed,
    retry: false,
    queryFn: () => certificateApi.getBySubmission(submissionId),
  });
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const certificate = certQuery.data;
      if (!certificate) {
        throw new Error("Certificate not found");
      }

      const primary = await certificateApi.downloadPdf(certificate.id).catch(() => null);
      if (primary instanceof Blob && primary.size > 0) {
        saveBlobAsFile(primary, `xamina-certificate-${certificate.certificate_no}.pdf`);
        return;
      }

      const fallback = await downloadPublicAssetFile(certificate.file_url, {
        expectedContentTypes: ["pdf", "octet-stream"],
        fallbackMimeType: "application/pdf",
      });
      if (fallback instanceof Blob && fallback.size > 0) {
        saveBlobAsFile(fallback, `xamina-certificate-${certificate.certificate_no}.pdf`);
        return;
      }

      throw new Error("Certificate download failed");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal mengunduh sertifikat."));
    },
  });

  if (resultQuery.isLoading) {
    return <p className="state-text">Memuat hasil ujian...</p>;
  }

  if (resultQuery.isError || !resultQuery.data) {
    return (
      <p className="state-text error">
        {errorMessageForCode(
          resultQuery.error,
          {
            SUBMISSION_NOT_FINISHED: "Sesi ujian belum selesai.",
            NOT_FOUND: "Result tidak ditemukan.",
          },
          "Gagal memuat hasil ujian.",
        )}
      </p>
    );
  }

  const result = resultQuery.data;
  const rows: ResultTableRow[] = result.breakdown.map((item) => ({ ...item, id: item.question_id }));

  return (
    <section className="panel-grid">
      <section className="page-hero card">
        <div className="page-hero-copy">
          <p className="section-eyebrow">Exam Result</p>
          <h3 className="section-title">Ringkasan hasil ujian yang lebih mudah dibaca</h3>
          <p className="section-desc">
            Status akhir, skor, dan akses sertifikat dirangkum dalam satu permukaan sebelum melihat breakdown jawaban.
          </p>
        </div>
        <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
          <span className={`pill ${result.passed ? "p-green" : "p-rose"}`}>
            {result.passed ? "PASSED" : "NOT PASSED"}
          </span>
          <span className="pill p-neu">Score: {result.score}</span>
          <span className="pill p-neu">
            Correct: {result.correct_count}/{result.total_questions}
          </span>
          <span className="pill p-neu">Pass score: {result.pass_score}</span>
        </div>
        <p className="state-text">
          Status akhir: {result.status} · Finished: {result.finished_at ? new Date(result.finished_at).toLocaleString() : "-"}
        </p>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => navigate({ to: "/app/my-exams" })}>
            Kembali ke daftar ujian
          </button>
          {certQuery.data ? (
            <span className="row gap-sm">
              <a className="btn" href={certQuery.data.file_url} target="_blank" rel="noreferrer">
                Lihat Sertifikat
              </a>
              <button
                className="btn btn-ghost"
                onClick={() => downloadMutation.mutate()}
                disabled={downloadMutation.isPending}
              >
                Download Sertifikat
              </button>
            </span>
          ) : null}
        </div>
      </section>

      <DataTable
        title="Breakdown Jawaban"
        rows={rows}
        loading={false}
        error={null}
        emptyLabel="Tidak ada data breakdown."
        columns={[
          { key: "question", header: "Question ID", render: (row: ResultTableRow) => <span className="text-mono">{row.question_id}</span> },
          { key: "type", header: "Type", render: (row: ResultTableRow) => <span className="badge badge-orange">{row.question_type}</span> },
          {
            key: "correct",
            header: "Correct",
            render: (row: ResultTableRow) => (
              <span className={`pill ${row.is_correct ? "p-green" : "p-rose"}`}>
                {row.is_correct ? "Correct" : "Wrong"}
              </span>
            ),
          },
          {
            key: "answer",
            header: "Submitted",
            render: (row: ResultTableRow) => <span className="text-mono">{JSON.stringify(row.submitted_answer)}</span>,
          },
        ]}
      />
    </section>
  );
}
