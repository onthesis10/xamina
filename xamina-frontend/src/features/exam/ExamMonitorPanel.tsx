import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createExamSocket, type WsEvent } from "@/lib/socket";
import { useWsStore } from "@/store/ws.store";
import { useToast } from "@/store/toast.store";

import { monitorApi, type ExamSubmissionItem } from "./monitor.api";

export function ExamMonitorPanel({ examId }: { examId: string }) {
    const navigate = useNavigate();
    const toast = useToast();
    const qc = useQueryClient();
    const socketRef = useRef<ReturnType<typeof createExamSocket> | null>(null);

    const {
        connectionStatus,
        connectedStudents,
        anomalyAlerts,
        setConnectionStatus,
        addStudent,
        removeStudent,
        updateStudentAnswered,
        addAnomaly,
        markStudentFinished,
        reset,
    } = useWsStore();

    // REST fallback: fetch submissions list
    const submissionsQuery = useQuery({
        queryKey: ["exam-submissions", examId],
        queryFn: () => monitorApi.getExamSubmissions(examId),
        refetchInterval: 10000,
    });

    const forceFinishMutation = useMutation({
        mutationFn: (studentId: string) => monitorApi.forceFinishSubmission(examId, studentId),
        onSuccess: async () => {
            toast.success("Force submit via REST berhasil");
            await qc.invalidateQueries({ queryKey: ["exam-submissions", examId] });
        },
        onError: () => {
            toast.error("Gagal force submit via REST");
        },
    });

    // WS connection
    useEffect(() => {
        reset();
        setConnectionStatus("connecting");

        const socket = createExamSocket({
            examId,
            onOpen: () => setConnectionStatus("connected"),
            onClose: () => setConnectionStatus("disconnected"),
            onMessage: (event: WsEvent) => {
                switch (event.type) {
                    case "StudentConnected":
                        addStudent(
                            event.data?.student_id as string,
                            event.data?.student_name as string,
                        );
                        break;
                    case "StudentDisconnected":
                        removeStudent(event.data?.student_id as string);
                        break;
                    case "AnswerSaved":
                        updateStudentAnswered(
                            event.data?.student_id as string,
                            event.data?.answered_count as number,
                        );
                        break;
                    case "AnomalyDetected":
                        addAnomaly(
                            event.data?.student_id as string,
                            event.data?.event_type as string,
                        );
                        toast.error(
                            `⚠️ Anomali: ${event.data?.event_type} dari siswa`,
                        );
                        break;
                    case "StudentFinished":
                        markStudentFinished(event.data?.student_id as string);
                        submissionsQuery.refetch();
                        break;
                    case "MonitorJoined":
                        toast.success("Terhubung ke monitor ujian");
                        break;
                    case "Error":
                        toast.error(String(event.data?.message ?? "WebSocket error"));
                        break;
                    default:
                        break;
                }
            },
        });

        socketRef.current = socket;

        return () => {
            socket.close();
            reset();
        };
    }, [examId]);

    const handleForceSubmit = (studentId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.send({
                type: "ForceSubmit",
                data: { student_id: studentId },
            });
            toast.success("Perintah force-submit terkirim via WebSocket");
            return;
        }

        if (forceFinishMutation.isPending) {
            toast.error("Force submit sedang diproses");
            return;
        }

        toast.error("WebSocket terputus, menggunakan fallback REST");
        forceFinishMutation.mutate(studentId);
    };

    const submissions = submissionsQuery.data ?? [];
    const studentList = Array.from(connectedStudents.values());

    return (
        <section className="panel-grid" style={{ gap: "1.5rem" }}>
            {/* Header */}
            <section className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <h2 className="section-title" style={{ marginBottom: 4 }}>
                        Monitor Ujian Live
                    </h2>
                    <p className="state-text">
                        Exam ID: {examId.slice(0, 8)}...
                    </p>
                </div>
                <div className="row gap-sm" style={{ alignItems: "center" }}>
                    <span
                        className={`pill ${connectionStatus === "connected"
                            ? "p-emerald"
                            : connectionStatus === "connecting"
                                ? "p-amber"
                                : "p-rose"
                            }`}
                    >
                        {connectionStatus === "connected"
                            ? "🟢 Live"
                            : connectionStatus === "connecting"
                                ? "🟡 Menghubungkan..."
                                : "🔴 Terputus"}
                    </span>
                    <span className="pill p-neu">
                        {studentList.length} siswa online
                    </span>
                    <button
                        className="btn btn-ghost"
                        onClick={() => navigate({ to: "/app/exams" })}
                    >
                        ← Kembali
                    </button>
                </div>
            </section>

            {/* Real-time connected students */}
            {studentList.length > 0 && (
                <section className="card">
                    <h3 className="section-title" style={{ marginBottom: "0.75rem" }}>
                        Siswa Online (WebSocket)
                    </h3>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nama</th>
                                    <th>Jawaban</th>
                                    <th>Anomali</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {studentList.map((s) => (
                                    <tr key={s.studentId}>
                                        <td>{s.studentName}</td>
                                        <td>{s.answeredCount}</td>
                                        <td>
                                            <span className={s.anomalyCount > 0 ? "pill p-rose" : "pill p-neu"}>
                                                {s.anomalyCount}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-danger"
                                                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                                                disabled={forceFinishMutation.isPending}
                                                onClick={() => handleForceSubmit(s.studentId)}
                                            >
                                                Force Submit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Anomaly Alerts Feed */}
            {anomalyAlerts.length > 0 && (
                <section className="card">
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
                        <h3 className="section-title" style={{ margin: 0 }}>
                            ⚠️ Peringatan Anomali ({anomalyAlerts.length})
                        </h3>
                        <button className="btn btn-ghost" onClick={() => useWsStore.getState().clearAlerts()}>
                            Bersihkan
                        </button>
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {anomalyAlerts.slice(0, 20).map((alert) => (
                            <div
                                key={alert.id}
                                className="row gap-sm"
                                style={{
                                    padding: "0.5rem",
                                    borderBottom: "1px solid var(--app-color-border)",
                                    fontSize: "0.85rem",
                                }}
                            >
                                <span className="pill p-rose">{alert.eventType}</span>
                                <span className="text-dimmed">
                                    {new Date(alert.timestamp).toLocaleTimeString()}
                                </span>
                                <span>Student: {alert.studentId.slice(0, 8)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* REST-based Submissions Table (fallback/full view) */}
            <section className="card">
                <h3 className="section-title" style={{ marginBottom: "0.75rem" }}>
                    Semua Submission
                </h3>
                {submissionsQuery.isLoading ? (
                    <p className="state-text">Memuat data submission...</p>
                ) : submissions.length === 0 ? (
                    <p className="state-text">Belum ada siswa yang memulai ujian ini.</p>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nama Siswa</th>
                                    <th>Status</th>
                                    <th>Jawaban</th>
                                    <th>Anomali</th>
                                    <th>Mulai</th>
                                    <th>Skor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((s: ExamSubmissionItem) => (
                                    <tr key={s.submission_id}>
                                        <td>{s.student_name}</td>
                                        <td>
                                            <span
                                                className={`pill ${s.status === "in_progress"
                                                    ? "p-amber"
                                                    : s.status === "finished"
                                                        ? "p-emerald"
                                                        : "p-neu"
                                                    }`}
                                            >
                                                {s.status}
                                            </span>
                                        </td>
                                        <td>{s.answered_count}</td>
                                        <td>
                                            <span className={s.anomaly_count > 0 ? "pill p-rose" : "pill p-neu"}>
                                                {s.anomaly_count}
                                            </span>
                                        </td>
                                        <td className="text-dimmed" style={{ fontSize: "0.8rem" }}>
                                            {new Date(s.started_at).toLocaleTimeString()}
                                        </td>
                                        <td>
                                            {s.score !== null ? (
                                                <strong>{s.score.toFixed(1)}</strong>
                                            ) : (
                                                <span className="text-dimmed">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </section>
    );
}
