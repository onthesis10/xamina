import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Chart from "chart.js/auto";

import { DataTable } from "@/components/DataTable";
import { errorMessageForCode } from "@/lib/axios";
import type {
    DashboardAdminSummaryDto,
    DashboardGuruSummaryDto,
    DashboardSummaryDto,
    TrendPointDto,
} from "@/types/api.types";

import { analyticsApi } from "./analytics.api";

type TrendRow = TrendPointDto & { id: string };

function TrendChart({ points }: { points: TrendPointDto[] }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        if (!canvasRef.current) return;
        const chart = new Chart(canvasRef.current, {
            type: "bar",
            data: {
                labels: points.map((item) => item.day),
                datasets: [
                    {
                        label: "Submissions",
                        data: points.map((item) => item.submissions),
                        borderColor: "#2f6fe4",
                        backgroundColor: "rgba(47,111,228,0.2)",
                        yAxisID: "y",
                    },
                    {
                        label: "Pass Rate (%)",
                        data: points.map((item) => item.pass_rate),
                        borderColor: "#1d9b5f",
                        backgroundColor: "rgba(29,155,95,0.2)",
                        yAxisID: "y1",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, position: "left" },
                    y1: { beginAtZero: true, position: "right", min: 0, max: 100 },
                },
            },
        });
        return () => chart.destroy();
    }, [points]);

    return (
        <section className="card">
            <h3 className="section-title">Trend 7 Hari</h3>
            <div className="chart-wrap">
                <canvas ref={canvasRef} />
            </div>
        </section>
    );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
    return (
        <section className="card metric-card">
            <p className="state-text">{label}</p>
            <h3 className="metric-value">{value}</h3>
        </section>
    );
}

function AdminGuruSummary({ data }: { data: DashboardAdminSummaryDto | DashboardGuruSummaryDto }) {
    const trend = data.role === "admin" || data.role === "guru" ? data.trend_7d : [];
    const trendRows: TrendRow[] = trend.map((item) => ({ ...item, id: item.day }));

    return (
        <section className="panel-grid">
            <div className="metric-grid">
                {data.role === "admin" ? (
                    <>
                        <MetricCard label="Users" value={data.users_total} />
                        <MetricCard label="Classes" value={data.classes_total} />
                        <MetricCard label="Exams" value={data.exams_total} />
                        <MetricCard label="Submissions" value={data.submissions_total} />
                    </>
                ) : (
                    <>
                        <MetricCard label="Exams" value={data.exams_total} />
                        <MetricCard label="Published Exams" value={data.published_exams_total} />
                        <MetricCard label="Submissions" value={data.submissions_total} />
                    </>
                )}
                <MetricCard label="Avg Score" value={data.avg_score.toFixed(2)} />
                <MetricCard label="Pass Rate (%)" value={data.pass_rate.toFixed(2)} />
            </div>
            <TrendChart points={trend} />
            <DataTable
                title="Trend Detail"
                rows={trendRows}
                columns={[
                    { key: "day", header: "Date", render: (row) => row.day },
                    { key: "submissions", header: "Submissions", render: (row) => row.submissions },
                    { key: "avg_score", header: "Avg Score", render: (row) => row.avg_score.toFixed(2) },
                    { key: "pass_rate", header: "Pass Rate (%)", render: (row) => row.pass_rate.toFixed(2) },
                ]}
                emptyLabel="Belum ada data trend 7 hari."
            />
        </section>
    );
}

function SiswaSummary({ data }: { data: Extract<DashboardSummaryDto, { role: "siswa" }> }) {
    const recentRows = data.recent_results.map((item) => ({
        ...item,
        id: `${item.exam_id}-${item.finished_at ?? "none"}`,
    }));
    const upcomingRows = data.upcoming_exams.map((item) => ({ ...item, id: item.exam_id }));

    return (
        <section className="panel-grid">
            <div className="metric-grid">
                <MetricCard label="In Progress" value={data.in_progress_count} />
                <MetricCard label="Finished" value={data.finished_count} />
                <MetricCard label="Avg Score" value={data.avg_score.toFixed(2)} />
            </div>
            <DataTable
                title="Upcoming Exams"
                rows={upcomingRows}
                columns={[
                    { key: "title", header: "Exam", render: (row) => row.title },
                    {
                        key: "window",
                        header: "Window",
                        render: (row) =>
                            row.start_at && row.end_at
                                ? `${new Date(row.start_at).toLocaleString()} - ${new Date(row.end_at).toLocaleString()}`
                                : "Unscheduled",
                    },
                ]}
                emptyLabel="Belum ada ujian mendatang."
            />
            <DataTable
                title="Recent Results"
                rows={recentRows}
                columns={[
                    { key: "exam", header: "Exam", render: (row) => row.exam_title },
                    { key: "status", header: "Status", render: (row) => row.status },
                    { key: "score", header: "Score", render: (row) => row.score.toFixed(2) },
                    {
                        key: "finished_at",
                        header: "Finished At",
                        render: (row) => (row.finished_at ? new Date(row.finished_at).toLocaleString() : "-"),
                    },
                ]}
                emptyLabel="Belum ada hasil ujian."
            />
        </section>
    );
}

export function DashboardPanel() {
    const summaryQuery = useQuery({
        queryKey: ["dashboard-summary"],
        queryFn: () => analyticsApi.summary(),
        refetchInterval: 30_000,
    });

    const content = useMemo(() => {
        const data = summaryQuery.data;
        if (!data) return null;
        if (data.role === "siswa") {
            return <SiswaSummary data={data} />;
        }
        return <AdminGuruSummary data={data} />;
    }, [summaryQuery.data]);

    if (summaryQuery.isLoading) {
        return <p className="state-text">Memuat dashboard...</p>;
    }
    if (summaryQuery.isError || !summaryQuery.data) {
        return (
            <p className="state-text error">
                {errorMessageForCode(
                    summaryQuery.error,
                    { FORBIDDEN: "Akses dashboard ditolak untuk role ini." },
                    "Gagal memuat dashboard summary.",
                )}
            </p>
        );
    }
    return content;
}
