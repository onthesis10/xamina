import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { DataTable } from "@/components/DataTable";
import { certificateApi } from "@/features/analytics/analytics.api";
import { errorMessageForCode } from "@/lib/axios";
import type { SubmissionResultItem } from "@/types/api.types";

import { sessionApi } from "./session.api";

type ResultTableRow = SubmissionResultItem & { id: string };

export function ExamResultPanel({ submissionId }: { submissionId: string }) {
    const navigate = useNavigate();
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
            <section className="card panel-grid">
                <h3 className="section-title">Hasil Ujian</h3>
                <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
                    <span className={`pill ${result.passed ? "p-green" : "p-rose"}`}>
                        {result.passed ? "PASSED" : "NOT PASSED"}
                    </span>
                    <span className="pill p-neu">Score: {result.score}</span>
                    <span className="pill p-neu">Correct: {result.correct_count}/{result.total_questions}</span>
                    <span className="pill p-neu">Pass score: {result.pass_score}</span>
                </div>
                <p className="state-text">
                    Status akhir: {result.status} · Finished:{" "}
                    {result.finished_at ? new Date(result.finished_at).toLocaleString() : "-"}
                </p>
                <button className="btn btn-ghost" onClick={() => navigate({ to: "/app/my-exams" })}>
                    Kembali ke daftar ujian
                </button>
                {certQuery.data ? (
                    <span className="row gap-sm">
                        <a
                            className="btn"
                            href={certQuery.data.file_url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Lihat Sertifikat
                        </a>
                        <a
                            className="btn btn-ghost"
                            href={certificateApi.downloadUrl(certQuery.data.id)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Download Sertifikat
                        </a>
                    </span>
                ) : null}
            </section>

            <DataTable
                title="Breakdown Jawaban"
                rows={rows}
                loading={false}
                error={null}
                emptyLabel="Tidak ada data breakdown."
                columns={[
                    { key: "question", header: "Question ID", render: (row: ResultTableRow) => row.question_id },
                    { key: "type", header: "Type", render: (row: ResultTableRow) => row.question_type },
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
                        render: (row: ResultTableRow) => JSON.stringify(row.submitted_answer),
                    },
                ]}
            />
        </section>
    );
}
