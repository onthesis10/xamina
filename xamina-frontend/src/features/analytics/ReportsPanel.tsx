import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Chart from "chart.js/auto";

import { CorePageTour } from "@/components/CorePageTour";
import { DataTable } from "@/components/DataTable";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { examApi } from "@/features/exam/exam.api";
import { api, errorMessageForCode, normalizeApiError } from "@/lib/axios";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/store/toast.store";
import { useUiStore } from "@/store/ui.store";
import type {
    ApiSuccess,
    ClassDto,
    ClassResultQuery,
    ClassResultRow,
    ItemAnalysisRowDto,
    ScoreDistributionBinDto,
    TimeSeriesPerformancePointDto,
} from "@/types/api.types";

import { analyticsApi, notificationApi } from "./analytics.api";

function readChartPalette() {
    const styles = getComputedStyle(document.documentElement);
    return {
        primary: styles.getPropertyValue("--primary").trim() || "#FF6B00",
        primarySoft: styles.getPropertyValue("--primary-bg").trim() || "rgba(255,107,0,0.16)",
        success: styles.getPropertyValue("--success").trim() || "#16A34A",
        successSoft: styles.getPropertyValue("--success-bg").trim() || "rgba(22,163,74,0.16)",
        warning: styles.getPropertyValue("--warning").trim() || "#CA8A04",
        warningSoft: styles.getPropertyValue("--warning-bg").trim() || "rgba(202,138,4,0.16)",
        textMuted: styles.getPropertyValue("--text-2").trim() || "#9C7A58",
        border: styles.getPropertyValue("--border").trim() || "#EAE0D4",
    };
}

type ReportTableRow = ClassResultRow & { id: string };
type SortDirection = "asc" | "desc";
type ItemSortKey = "question_content" | "p_value" | "point_biserial" | "correct_rate";

function DistributionChart({ bins }: { bins: ScoreDistributionBinDto[] }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const themeMode = useUiStore((state) => state.themeMode);

    useEffect(() => {
        if (!canvasRef.current) return;
        const palette = readChartPalette();
        const chart = new Chart(canvasRef.current, {
            type: "bar",
            data: {
                labels: bins.map((item) => item.label),
                datasets: [
                    {
                        label: "Students",
                        data: bins.map((item) => item.count),
                        borderColor: palette.primary,
                        backgroundColor: palette.primarySoft,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: palette.textMuted,
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: palette.textMuted },
                        grid: { color: palette.border },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: palette.textMuted },
                        grid: { color: palette.border },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [bins, themeMode]);

    return (
        <section className="card">
            <h3 className="section-title">Histogram Nilai</h3>
            <div className="chart-wrap">
                <canvas ref={canvasRef} />
            </div>
        </section>
    );
}

function TimeSeriesChart({ points }: { points: TimeSeriesPerformancePointDto[] }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const themeMode = useUiStore((state) => state.themeMode);

    useEffect(() => {
        if (!canvasRef.current) return;
        const palette = readChartPalette();
        const chart = new Chart(canvasRef.current, {
            type: "line",
            data: {
                labels: points.map((item) => item.day),
                datasets: [
                    {
                        label: "Avg Score",
                        data: points.map((item) => item.avg_score),
                        borderColor: palette.success,
                        backgroundColor: palette.successSoft,
                        yAxisID: "y",
                    },
                    {
                        label: "Pass Rate (%)",
                        data: points.map((item) => item.pass_rate),
                        borderColor: palette.warning,
                        backgroundColor: palette.warningSoft,
                        yAxisID: "y1",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: palette.textMuted,
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: palette.textMuted },
                        grid: { color: palette.border },
                    },
                    y: {
                        beginAtZero: true,
                        position: "left",
                        min: 0,
                        max: 100,
                        ticks: { color: palette.textMuted },
                        grid: { color: palette.border },
                    },
                    y1: {
                        beginAtZero: true,
                        position: "right",
                        min: 0,
                        max: 100,
                        ticks: { color: palette.textMuted },
                        grid: { color: palette.border },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [points, themeMode]);

    return (
        <section className="card">
            <h3 className="section-title">Time Series Performa</h3>
            <div className="chart-wrap">
                <canvas ref={canvasRef} />
            </div>
        </section>
    );
}

export function ReportsPanel() {
    const toast = useToast();
    const user = useAuthStore((state) => state.user);
    const activeTenantId = useUiStore((state) => state.activeTenantId);
    const setActiveTenantId = useUiStore((state) => state.setActiveTenantId);
    const [query, setQuery] = useState<ClassResultQuery>({ page: 1, page_size: 20 });
    const [broadcastTitle, setBroadcastTitle] = useState("");
    const [broadcastMessage, setBroadcastMessage] = useState("");
    const [roleTargets, setRoleTargets] = useState<Array<"admin" | "guru" | "siswa">>(["siswa"]);
    const [sendPush, setSendPush] = useState(true);
    const [itemSort, setItemSort] = useState<{ key: ItemSortKey; direction: SortDirection }>({
        key: "point_biserial",
        direction: "desc",
    });

    const selectedExamId = query.exam_id ?? "";
    const tenantScopeKey =
        user?.role === "super_admin" ? activeTenantId ?? "super_admin_self" : user?.tenant_id ?? "unknown_tenant";

    const classesQuery = useQuery({
        queryKey: ["classes-for-report", tenantScopeKey],
        queryFn: async () => {
            const response = await api.get<ApiSuccess<ClassDto[]>>("/classes");
            return response.data.data;
        },
    });

    const examsQuery = useQuery({
        queryKey: ["exams-for-report", tenantScopeKey],
        queryFn: () => examApi.list({ page: 1, page_size: 100 }),
    });

    const reportQuery = useQuery({
        queryKey: ["class-results-report", tenantScopeKey, query],
        queryFn: () => analyticsApi.classResults(query),
    });

    const insightsQuery = useQuery({
        queryKey: ["exam-insights-report", tenantScopeKey, query.exam_id, query.class_id],
        queryFn: () =>
            analyticsApi.examInsights({
                exam_id: selectedExamId,
                class_id: query.class_id || undefined,
            }),
        enabled:
            Boolean(selectedExamId) &&
            (examsQuery.data?.data ?? []).some((item) => item.id === selectedExamId),
        retry: (failureCount, error) => {
            const normalized = normalizeApiError(error);
            if (
                normalized.status === 404 ||
                normalized.code === "NOT_FOUND" ||
                normalized.code === "VALIDATION_ERROR"
            ) {
                return false;
            }
            return failureCount < 2;
        },
    });

    useEffect(() => {
        if (!selectedExamId || !examsQuery.isSuccess) {
            return;
        }
        const selectedStillExists = (examsQuery.data.data ?? []).some(
            (item) => item.id === selectedExamId,
        );
        if (selectedStillExists) {
            return;
        }
        setQuery((old) => ({
            ...old,
            page: 1,
            exam_id: undefined,
        }));
        toast.error("Exam terpilih tidak ditemukan pada tenant aktif. Silakan pilih ulang exam.");
    }, [selectedExamId, examsQuery.data, examsQuery.isSuccess, toast]);

    useEffect(() => {
        setQuery((old) => ({
            ...old,
            page: 1,
            exam_id: undefined,
            class_id: undefined,
        }));
    }, [tenantScopeKey]);

    useEffect(() => {
        if (!insightsQuery.isError) {
            return;
        }
        const normalized = normalizeApiError(insightsQuery.error);
        if (normalized.status !== 404) {
            return;
        }
        if (user?.role !== "super_admin" || !activeTenantId) {
            return;
        }
        setActiveTenantId(null);
        setQuery((old) => ({
            ...old,
            page: 1,
            exam_id: undefined,
            class_id: undefined,
        }));
        toast.error(
            "Tenant aktif tidak valid untuk exam ini. Tenant switch di-reset, silakan pilih tenant lalu exam lagi.",
        );
    }, [
        insightsQuery.isError,
        insightsQuery.error,
        user?.role,
        activeTenantId,
        setActiveTenantId,
        toast,
    ]);

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

    const onDownloadExcel = async () => {
        if (!selectedExamId) {
            toast.error("Pilih exam terlebih dulu untuk export Excel insight.");
            return;
        }
        const selectedStillExists = (examsQuery.data?.data ?? []).some(
            (item) => item.id === selectedExamId,
        );
        if (!selectedStillExists) {
            setQuery((old) => ({
                ...old,
                page: 1,
                exam_id: undefined,
            }));
            toast.error("Exam tidak ditemukan di tenant aktif. Pilih ulang exam sebelum export.");
            return;
        }
        try {
            const blob = await analyticsApi.exportExamInsightsExcel({
                exam_id: selectedExamId,
                class_id: query.class_id || undefined,
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "exam-insights.xlsx";
            anchor.click();
            URL.revokeObjectURL(url);
            toast.success("Export Excel berhasil.");
        } catch (error) {
            toast.error(
                errorMessageForCode(
                    error,
                    {
                        NOT_FOUND: "Exam tidak ditemukan di tenant aktif. Pilih ulang exam.",
                    },
                    "Gagal export Excel insight.",
                ),
            );
        }
    };

    const sortedItemAnalysis = useMemo(() => {
        const source = insightsQuery.data?.item_analysis ?? [];
        const valueOf = (row: ItemAnalysisRowDto, key: ItemSortKey): number | string => {
            if (key === "question_content") return row.question_content.toLowerCase();
            if (key === "p_value") return row.p_value;
            if (key === "point_biserial") return row.point_biserial ?? Number.NEGATIVE_INFINITY;
            return row.total_attempts > 0 ? row.correct_attempts / row.total_attempts : 0;
        };

        const sorted = [...source].sort((a, b) => {
            const left = valueOf(a, itemSort.key);
            const right = valueOf(b, itemSort.key);
            if (typeof left === "string" && typeof right === "string") {
                return itemSort.direction === "asc"
                    ? left.localeCompare(right)
                    : right.localeCompare(left);
            }
            const nLeft = Number(left);
            const nRight = Number(right);
            return itemSort.direction === "asc" ? nLeft - nRight : nRight - nLeft;
        });
        return sorted;
    }, [insightsQuery.data?.item_analysis, itemSort.direction, itemSort.key]);

    const setSortKey = (key: ItemSortKey) => {
        setItemSort((current) => {
            if (current.key === key) {
                return { key, direction: current.direction === "asc" ? "desc" : "asc" };
            }
            return { key, direction: key === "question_content" ? "asc" : "desc" };
        });
    };

    return (
        <section className="panel-grid" data-tour="reports">
            <CorePageTour
                page="reports"
                title="Tutup loop evaluasi di Reports"
                description="Page ini dipakai untuk laporan kelas, broadcast, dan insight analytics Sprint 11-12."
                bullets={[
                    "Pilih exam aktif sebelum membuka exam insights atau export Excel.",
                    "Gunakan broadcast untuk notifikasi massal ke role yang dipilih.",
                    "Step terakhir tour memastikan reporting flow siap untuk Phase Beta exit.",
                ]}
            />
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
                        value={selectedExamId}
                        onChange={(event) =>
                            setQuery((old) => ({
                                ...old,
                                page: 1,
                                exam_id: event.target.value || undefined,
                            }))
                        }
                    >
                        <option value="">Pilih exam (wajib untuk insights)</option>
                        {(examsQuery.data?.data ?? []).map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.title}
                            </option>
                        ))}
                    </select>
                    <button
                        className="btn btn-ghost"
                        onClick={() =>
                            setQuery((old) => ({
                                ...old,
                                page: Math.max(1, (old.page ?? 1) - 1),
                            }))
                        }
                    >
                        Prev
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={() =>
                            setQuery((old) => ({
                                ...old,
                                page: (old.page ?? 1) + 1,
                            }))
                        }
                    >
                        Next
                    </button>
                </div>
                <div className="row gap-sm" style={{ marginTop: 12 }}>
                    <button className="btn" onClick={onDownloadCsv}>
                        Export CSV
                    </button>
                    <button className="btn" onClick={onDownloadExcel} disabled={!selectedExamId}>
                        Export Excel
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

            <section className="card">
                <h3 className="section-title">Analitik Ujian Lanjutan</h3>
                {!selectedExamId ? (
                    <p className="state-text">Pilih exam dari filter untuk menampilkan analitik Sprint 11.</p>
                ) : null}
                {insightsQuery.isLoading ? (
                    <div className="panel-grid">
                        <div className="metric-grid">
                            <LoadingSkeleton card lines={2} />
                            <LoadingSkeleton card lines={2} />
                            <LoadingSkeleton card lines={2} />
                            <LoadingSkeleton card lines={2} />
                        </div>
                        <LoadingSkeleton card lines={4} />
                        <LoadingSkeleton card lines={4} />
                        <LoadingSkeleton card lines={5} />
                    </div>
                ) : null}
                {insightsQuery.isError ? (
                    <p className="state-text error">
                        {errorMessageForCode(
                            insightsQuery.error,
                            {
                                FORBIDDEN: "Role ini tidak diizinkan melihat exam insights.",
                                VALIDATION_ERROR: "exam_id wajib diisi untuk insights.",
                                NOT_FOUND: "Exam tidak ditemukan di tenant aktif. Pilih exam lain.",
                            },
                            "Gagal memuat exam insights.",
                        )}
                    </p>
                ) : null}

                {insightsQuery.data ? (
                    <div className="panel-grid">
                        <div className="metric-grid">
                            <section className="card metric-card">
                                <p className="state-text">Exam</p>
                                <h3 className="metric-value">{insightsQuery.data.summary.exam_title}</h3>
                            </section>
                            <section className="card metric-card">
                                <p className="state-text">Submissions</p>
                                <h3 className="metric-value">{insightsQuery.data.summary.submission_count}</h3>
                            </section>
                            <section className="card metric-card">
                                <p className="state-text">Avg Score</p>
                                <h3 className="metric-value">
                                    {insightsQuery.data.summary.avg_score.toFixed(2)}
                                </h3>
                            </section>
                            <section className="card metric-card">
                                <p className="state-text">Pass Rate (%)</p>
                                <h3 className="metric-value">
                                    {insightsQuery.data.summary.pass_rate.toFixed(2)}
                                </h3>
                            </section>
                        </div>

                        <DistributionChart bins={insightsQuery.data.distribution} />
                        <TimeSeriesChart points={insightsQuery.data.time_series} />

                        <section className="card">
                            <h3 className="section-title">Item Analysis</h3>
                            <div className="row gap-sm" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => setSortKey("question_content")}
                                >
                                    Sort Content
                                </button>
                                <button className="btn btn-ghost" onClick={() => setSortKey("p_value")}>
                                    Sort P-Value
                                </button>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => setSortKey("point_biserial")}
                                >
                                    Sort Point-Biserial
                                </button>
                                <button className="btn btn-ghost" onClick={() => setSortKey("correct_rate")}>
                                    Sort Correct Rate
                                </button>
                                <span className="state-text">
                                    Active: {itemSort.key} ({itemSort.direction})
                                </span>
                            </div>

                            <div className="table-wrap">
                                <table className="x-table">
                                    <thead>
                                        <tr>
                                            <th>Question</th>
                                            <th>Type</th>
                                            <th>Attempts</th>
                                            <th>Correct</th>
                                            <th>P-Value</th>
                                            <th>Point-Biserial</th>
                                            <th>Recommendations</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedItemAnalysis.map((row) => (
                                            <tr key={row.question_id}>
                                                <td>{row.question_content}</td>
                                                <td>{row.question_type}</td>
                                                <td>{row.total_attempts}</td>
                                                <td>{row.correct_attempts}</td>
                                                <td>{row.p_value.toFixed(4)}</td>
                                                <td>
                                                    {row.point_biserial === null
                                                        ? "-"
                                                        : row.point_biserial.toFixed(4)}
                                                </td>
                                                <td>{row.recommendations.join(", ") || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {sortedItemAnalysis.length === 0 ? (
                                <p className="state-text">Belum ada data item analysis untuk filter ini.</p>
                            ) : null}
                        </section>
                    </div>
                ) : null}
            </section>
        </section>
    );
}
