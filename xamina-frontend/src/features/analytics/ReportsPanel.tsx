import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { examApi } from "@/features/exam/exam.api";
import { api } from "@/lib/axios";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { ApiSuccess, ClassDto, ClassResultQuery } from "@/types/api.types";

import { analyticsApi, notificationApi } from "./analytics.api";

type ReportTableRow = {
    id: string;
    class_name: string | null;
    grade: string | null;
    major: string | null;
    exam_title: string;
    submission_count: number;
    avg_score: number;
    pass_rate: number;
    last_submission_at: string | null;
};

export function ReportsPanel() {
    const toast = useToast();
    const [query, setQuery] = useState<ClassResultQuery>({ page: 1, page_size: 20 });
    const [broadcastTitle, setBroadcastTitle] = useState("");
    const [broadcastMessage, setBroadcastMessage] = useState("");
    const [roleTargets, setRoleTargets] = useState<Array<"admin" | "guru" | "siswa">>(["siswa"]);
    const [sendPush, setSendPush] = useState(true);

    const classesQuery = useQuery({
        queryKey: ["classes-for-report"],
        queryFn: async () => {
            const response = await api.get<ApiSuccess<ClassDto[]>>("/classes");
            return response.data.data;
        },
    });

    const examsQuery = useQuery({
        queryKey: ["exams-for-report"],
        queryFn: () => examApi.list({ page: 1, page_size: 100 }),
    });

    const reportQuery = useQuery({
        queryKey: ["class-results-report", query],
        queryFn: () => analyticsApi.classResults(query),
    });
    const broadcastMutation = useMutation({
        mutationFn: () =>
            notificationApi.broadcast({
                title: broadcastTitle,
                message: broadcastMessage,
                target_roles: roleTargets,
                send_push: sendPush,
            }),
        onSuccess: (result) => {
            toast.success(
                `Broadcast terkirim ke ${result.targeted_users} user (${result.created_notifications} notifikasi).`,
            );
            setBroadcastTitle("");
            setBroadcastMessage("");
        },
        onError: (error) => {
            toast.error(errorMessageForCode(error, {}, "Gagal kirim broadcast."));
        },
    });

    const rows: ReportTableRow[] = useMemo(
        () =>
            (reportQuery.data?.data ?? []).map((row) => ({
                id: `${row.class_id ?? "none"}-${row.exam_id}`,
                ...row,
            })),
        [reportQuery.data],
    );

    const onDownloadCsv = async () => {
        try {
            const blob = await analyticsApi.exportClassResultsCsv(query);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "class-results.csv";
            anchor.click();
            URL.revokeObjectURL(url);
            toast.success("Export CSV berhasil.");
        } catch (error) {
            toast.error(errorMessageForCode(error, {}, "Gagal export CSV report."));
        }
    };

    return (
        <section className="panel-grid">
            <section className="card">
                <h3 className="section-title">Filter Laporan</h3>
                <div className="grid-4">
                    <select
                        className="input"
                        value={query.class_id ?? ""}
                        onChange={(event) =>
                            setQuery((old) => ({
                                ...old,
                                page: 1,
                                class_id: event.target.value || undefined,
                            }))
                        }
                    >
                        <option value="">All Classes</option>
                        {(classesQuery.data ?? []).map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                    <select
                        className="input"
                        value={query.exam_id ?? ""}
                        onChange={(event) =>
                            setQuery((old) => ({
                                ...old,
                                page: 1,
                                exam_id: event.target.value || undefined,
                            }))
                        }
                    >
                        <option value="">All Exams</option>
                        {(examsQuery.data?.data ?? []).map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.title}
                            </option>
                        ))}
                    </select>
                    <button className="btn btn-ghost" onClick={() => setQuery((old) => ({ ...old, page: Math.max(1, (old.page ?? 1) - 1) }))}>
                        Prev
                    </button>
                    <button className="btn btn-ghost" onClick={() => setQuery((old) => ({ ...old, page: (old.page ?? 1) + 1 }))}>
                        Next
                    </button>
                </div>
                <div className="row gap-sm" style={{ marginTop: 12 }}>
                    <button className="btn" onClick={onDownloadCsv}>
                        Export CSV
                    </button>
                    <span className="state-text">
                        Page {reportQuery.data?.meta.page ?? 1} /{" "}
                        {Math.max(
                            1,
                            Math.ceil(
                                (reportQuery.data?.meta.total ?? 0) /
                                    (reportQuery.data?.meta.page_size ?? 20),
                            ),
                        )}
                    </span>
                </div>
            </section>

            <section className="card">
                <h3 className="section-title">Broadcast Message</h3>
                <div className="panel-grid">
                    <input
                        className="input"
                        placeholder="Judul broadcast"
                        value={broadcastTitle}
                        onChange={(event) => setBroadcastTitle(event.target.value)}
                    />
                    <textarea
                        className="textarea"
                        rows={4}
                        placeholder="Isi pesan broadcast"
                        value={broadcastMessage}
                        onChange={(event) => setBroadcastMessage(event.target.value)}
                    />
                    <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
                        {(["admin", "guru", "siswa"] as const).map((role) => (
                            <label key={role} className="row gap-sm">
                                <input
                                    type="checkbox"
                                    checked={roleTargets.includes(role)}
                                    onChange={(event) =>
                                        setRoleTargets((old) =>
                                            event.target.checked
                                                ? Array.from(new Set([...old, role]))
                                                : old.filter((item) => item !== role),
                                        )
                                    }
                                />
                                <span>{role}</span>
                            </label>
                        ))}
                    </div>
                    <label className="row gap-sm">
                        <input
                            type="checkbox"
                            checked={sendPush}
                            onChange={(event) => setSendPush(event.target.checked)}
                        />
                        <span>Kirim juga ke push queue</span>
                    </label>
                    <button
                        className="btn"
                        onClick={() => broadcastMutation.mutate()}
                        disabled={
                            broadcastMutation.isPending ||
                            !broadcastTitle.trim() ||
                            !broadcastMessage.trim() ||
                            roleTargets.length === 0
                        }
                    >
                        {broadcastMutation.isPending ? "Mengirim..." : "Kirim Broadcast"}
                    </button>
                </div>
            </section>

            <DataTable
                title="Hasil per Kelas"
                rows={rows}
                loading={reportQuery.isLoading}
                error={
                    reportQuery.isError
                        ? errorMessageForCode(
                              reportQuery.error,
                              {
                                  FORBIDDEN: "Role ini tidak diizinkan melihat report.",
                              },
                              "Gagal memuat laporan kelas.",
                          )
                        : null
                }
                columns={[
                    { key: "class", header: "Class", render: (row) => row.class_name ?? "Unassigned" },
                    {
                        key: "grade_major",
                        header: "Grade/Major",
                        render: (row) => `${row.grade ?? "-"} / ${row.major ?? "-"}`,
                    },
                    { key: "exam", header: "Exam", render: (row) => row.exam_title },
                    { key: "submission_count", header: "Submissions", render: (row) => row.submission_count },
                    { key: "avg_score", header: "Avg Score", render: (row) => row.avg_score.toFixed(2) },
                    { key: "pass_rate", header: "Pass Rate (%)", render: (row) => row.pass_rate.toFixed(2) },
                    {
                        key: "last_submission_at",
                        header: "Last Submission",
                        render: (row) =>
                            row.last_submission_at ? new Date(row.last_submission_at).toLocaleString() : "-",
                    },
                ]}
                emptyLabel="Belum ada data hasil ujian untuk filter ini."
            />
        </section>
    );
}
