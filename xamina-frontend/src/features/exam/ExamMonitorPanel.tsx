import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { DataTable } from "@/components/DataTable";
import { createExamSocket, type WsEvent } from "@/lib/socket";
import { useToast } from "@/store/toast.store";
import { useWsStore } from "@/store/ws.store";

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
    clearAlerts,
    reset,
  } = useWsStore();

  const submissionsQuery = useQuery({
    queryKey: ["exam-submissions", examId],
    queryFn: () => monitorApi.getExamSubmissions(examId),
    refetchInterval: 10_000,
  });
  const refetchSubmissions = submissionsQuery.refetch;

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
            addStudent(event.data?.student_id as string, event.data?.student_name as string);
            break;
          case "StudentDisconnected":
            removeStudent(event.data?.student_id as string);
            break;
          case "AnswerSaved":
            updateStudentAnswered(event.data?.student_id as string, event.data?.answered_count as number);
            break;
          case "AnomalyDetected":
            addAnomaly(event.data?.student_id as string, event.data?.event_type as string);
            toast.error(`Anomali: ${String(event.data?.event_type ?? "unknown")}`);
            break;
          case "StudentFinished":
            markStudentFinished(event.data?.student_id as string);
            refetchSubmissions();
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
  const studentList = useMemo(
    () => Array.from(connectedStudents.values()).map((item) => ({ ...item, id: item.studentId })),
    [connectedStudents],
  );
  const submissionRows = submissions.map((item) => ({ ...item, id: item.submission_id }));

  return (
    <section className="panel-grid">
      <section className="card onboarding-tour">
        <div className="panel-header">
          <div>
            <p className="section-eyebrow">Live Monitor</p>
            <h2 className="section-title">Monitor Ujian Live</h2>
            <p className="state-text">Exam ID: <span className="text-mono">{examId}</span></p>
          </div>
          <div className="inline-actions">
            <span className={`pill ${connectionStatus === "connected" ? "p-green" : connectionStatus === "connecting" ? "p-amber" : "p-rose"}`}>
              {connectionStatus === "connected" ? "Live" : connectionStatus === "connecting" ? "Connecting" : "Disconnected"}
            </span>
            <span className="pill p-neu">{studentList.length} siswa online</span>
            <button className="btn btn-ghost" onClick={() => navigate({ to: "/app/exams" })}>
              Kembali
            </button>
          </div>
        </div>
      </section>

      {studentList.length > 0 ? (
        <DataTable
          title="Siswa Online (WebSocket)"
          rows={studentList}
          columns={[
            { key: "studentName", header: "Nama", render: (row) => row.studentName },
            { key: "answeredCount", header: "Jawaban", render: (row) => row.answeredCount },
            {
              key: "anomalyCount",
              header: "Anomali",
              render: (row) => <span className={`pill ${row.anomalyCount > 0 ? "p-rose" : "p-neu"}`}>{row.anomalyCount}</span>,
            },
            {
              key: "action",
              header: "Aksi",
              render: (row) => (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={forceFinishMutation.isPending}
                  onClick={() => handleForceSubmit(row.studentId)}
                >
                  Force Submit
                </button>
              ),
            },
          ]}
        />
      ) : null}

      {anomalyAlerts.length > 0 ? (
        <section className="card">
          <div className="panel-header">
            <div>
              <p className="section-eyebrow">Anomaly Feed</p>
              <h3 className="section-title-sm">Peringatan Anomali ({anomalyAlerts.length})</h3>
            </div>
            <button className="btn btn-ghost" onClick={clearAlerts}>
              Bersihkan
            </button>
          </div>

          <div className="stack gap-sm" style={{ maxHeight: 260, overflowY: "auto", marginTop: 16 }}>
            {anomalyAlerts.slice(0, 20).map((alert) => (
              <div key={alert.id} className="surface-muted">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <span className="pill p-rose">{alert.eventType}</span>
                  <span className="state-text text-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="state-text mt-2">Student: {alert.studentId.slice(0, 8)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <DataTable
        title="Semua Submission"
        rows={submissionRows}
        loading={submissionsQuery.isLoading}
        emptyLabel="Belum ada siswa yang memulai ujian ini."
        columns={[
          { key: "student_name", header: "Nama Siswa", render: (row: ExamSubmissionRow) => row.student_name },
          {
            key: "status",
            header: "Status",
            render: (row: ExamSubmissionRow) => (
              <span className={`pill ${row.status === "in_progress" ? "p-amber" : row.status === "finished" ? "p-green" : "p-neu"}`}>
                {row.status}
              </span>
            ),
          },
          { key: "answered_count", header: "Jawaban", render: (row: ExamSubmissionRow) => row.answered_count },
          {
            key: "anomaly_count",
            header: "Anomali",
            render: (row: ExamSubmissionRow) => (
              <span className={`pill ${row.anomaly_count > 0 ? "p-rose" : "p-neu"}`}>{row.anomaly_count}</span>
            ),
          },
          {
            key: "started_at",
            header: "Mulai",
            render: (row: ExamSubmissionRow) => <span className="text-mono">{new Date(row.started_at).toLocaleTimeString()}</span>,
          },
          {
            key: "score",
            header: "Skor",
            render: (row: ExamSubmissionRow) => (row.score !== null ? row.score.toFixed(1) : "—"),
          },
        ]}
      />
    </section>
  );
}

type ExamSubmissionRow = ExamSubmissionItem & { id: string };
