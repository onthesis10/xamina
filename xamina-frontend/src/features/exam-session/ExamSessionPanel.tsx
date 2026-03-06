import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { errorMessageForCode } from "@/lib/axios";
import { createExamSocket, type WsEvent } from "@/lib/socket";
import { useToast } from "@/store/toast.store";
import type { SessionQuestionDto, SubmissionAnswerInput, SubmissionSessionDto } from "@/types/api.types";

import { sessionApi } from "./session.api";

type LocalAnswerMap = Record<string, { answer: unknown; is_bookmarked: boolean }>;

function toAnswerMap(session: SubmissionSessionDto): LocalAnswerMap {
    const map: LocalAnswerMap = {};
    for (const answer of session.answers) {
        map[answer.question_id] = {
            answer: answer.answer_jsonb,
            is_bookmarked: answer.is_bookmarked,
        };
    }
    return map;
}

function formatRemaining(seconds: number): string {
    const safe = Math.max(0, seconds);
    const mm = Math.floor(safe / 60)
        .toString()
        .padStart(2, "0");
    const ss = Math.floor(safe % 60)
        .toString()
        .padStart(2, "0");
    return `${mm}:${ss}`;
}

function renderAnswerInput(
    question: SessionQuestionDto,
    value: unknown,
    onChange: (next: unknown) => void,
) {
    if (question.type === "multiple_choice" || question.type === "true_false") {
        const options = Array.isArray(question.options_jsonb) ? question.options_jsonb : [];
        return (
            <div className="panel-grid">
                {options.map((option, index) => {
                    const anyOption = option as { id?: string; label?: string; value?: boolean };
                    const optionValue =
                        anyOption.id ??
                        (typeof anyOption.value === "boolean" ? anyOption.value : index.toString());
                    const label =
                        anyOption.label ??
                        (typeof anyOption.value === "boolean" ? String(anyOption.value) : String(optionValue));
                    const checked = value === optionValue;
                    return (
                        <label key={`${question.question_id}-${index}`} className="row gap-sm">
                            <input
                                type="radio"
                                name={question.question_id}
                                checked={checked}
                                onChange={() => onChange(optionValue)}
                            />
                            <span>{label}</span>
                        </label>
                    );
                })}
            </div>
        );
    }

    return (
        <textarea
            className="textarea"
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Tulis jawaban singkat..."
        />
    );
}

export function ExamSessionPanel({ submissionId }: { submissionId: string }) {
    const navigate = useNavigate();
    const toast = useToast();
    const wsRef = useRef<ReturnType<typeof createExamSocket> | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [answerMap, setAnswerMap] = useState<LocalAnswerMap>({});
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);
    const hydratedRef = useRef(false);
    const finishRequestedRef = useRef(false);

    const sessionQuery = useQuery({
        queryKey: ["submission-session", submissionId],
        queryFn: () => sessionApi.getSubmission(submissionId),
        refetchInterval: 30_000,
    });

    useEffect(() => {
        if (!sessionQuery.data) return;
        setRemainingSeconds(sessionQuery.data.remaining_seconds);
        if (!hydratedRef.current) {
            setAnswerMap(toAnswerMap(sessionQuery.data));
            hydratedRef.current = true;
        }
    }, [sessionQuery.data]);

    useEffect(() => {
        const interval = setInterval(() => {
            setRemainingSeconds((old) => Math.max(0, old - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const saveAnswersMutation = useMutation({
        mutationFn: (answers: SubmissionAnswerInput[]) => sessionApi.upsertAnswers(submissionId, answers),
        onError: (error) => {
            toast.error(
                errorMessageForCode(
                    error,
                    { SUBMISSION_FINISHED: "Sesi sudah selesai, jawaban tidak bisa diubah." },
                    "Gagal menyimpan jawaban.",
                ),
            );
        },
    });

    const finishMutation = useMutation({
        mutationFn: () => sessionApi.finishSubmission(submissionId),
        onSuccess: () => {
            toast.success("Ujian selesai. Menampilkan hasil.");
            navigate({ to: "/app/my-exams/result/$submissionId", params: { submissionId } });
        },
        onError: (error) => {
            finishRequestedRef.current = false;
            toast.error(errorMessageForCode(error, {}, "Gagal menyelesaikan submission."));
        },
    });

    const triggerFinish = useCallback(() => {
        if (finishRequestedRef.current || finishMutation.isPending) {
            return;
        }
        finishRequestedRef.current = true;
        finishMutation.mutate();
    }, [finishMutation]);

    const anomalyMutation = useMutation({
        mutationFn: (eventType: string) =>
            sessionApi.logAnomaly(submissionId, {
                event_type: eventType,
                payload_jsonb: { at: new Date().toISOString() },
            }),
    });

    useEffect(() => {
        const interval = setInterval(() => {
            if (dirtyIds.size === 0 || saveAnswersMutation.isPending) return;
            const payload: SubmissionAnswerInput[] = Array.from(dirtyIds).map((questionId) => ({
                question_id: questionId,
                answer: answerMap[questionId]?.answer,
                is_bookmarked: answerMap[questionId]?.is_bookmarked ?? false,
            }));
            saveAnswersMutation.mutate(payload, {
                onSuccess: () => setDirtyIds(new Set()),
            });
        }, 5000);
        return () => clearInterval(interval);
    }, [answerMap, dirtyIds, saveAnswersMutation]);

    useEffect(() => {
        const session = sessionQuery.data;
        if (!session || session.status !== "in_progress") {
            return;
        }

        const socket = createExamSocket({
            examId: session.exam_id,
            onMessage: (event: WsEvent) => {
                if (event.type !== "ForceSubmitAck") {
                    return;
                }

                const eventSubmissionId = String(event.data?.submission_id ?? "");
                if (eventSubmissionId && eventSubmissionId !== submissionId) {
                    return;
                }

                toast.error("Submission dipaksa selesai oleh monitor");
                triggerFinish();
            },
        });

        wsRef.current = socket;
        return () => {
            socket.close();
            wsRef.current = null;
        };
    }, [sessionQuery.data, submissionId, toast, triggerFinish]);

    // === Auto-Fullscreen on exam start ===
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (err) {
                console.warn("[Exam] Fullscreen request denied:", err);
            }
        };
        enterFullscreen();
        // Exit fullscreen when component unmounts (exam finished)
        return () => {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => { });
            }
        };
    }, []);

    // === Anti-Cheat Suite ===
    // 1. Tab/window visibility change
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                anomalyMutation.mutate("tab_hidden");
                toast.error("⚠️ Peringatan: Anda meninggalkan tab ujian! Aktivitas ini tercatat.");
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [anomalyMutation, toast]);

    // 2. Copy / Cut / Paste blocking
    useEffect(() => {
        const blockCopy = (e: ClipboardEvent) => {
            e.preventDefault();
            anomalyMutation.mutate("copy_attempt");
            toast.error("⚠️ Copy tidak diizinkan selama ujian!");
        };
        const blockCut = (e: ClipboardEvent) => {
            e.preventDefault();
            anomalyMutation.mutate("cut_attempt");
            toast.error("⚠️ Cut tidak diizinkan selama ujian!");
        };
        const blockPaste = (e: ClipboardEvent) => {
            e.preventDefault();
            anomalyMutation.mutate("paste_attempt");
            toast.error("⚠️ Paste tidak diizinkan selama ujian!");
        };
        document.addEventListener("copy", blockCopy);
        document.addEventListener("cut", blockCut);
        document.addEventListener("paste", blockPaste);
        return () => {
            document.removeEventListener("copy", blockCopy);
            document.removeEventListener("cut", blockCut);
            document.removeEventListener("paste", blockPaste);
        };
    }, [anomalyMutation, toast]);

    // 3. Right-click (context menu) prevention
    useEffect(() => {
        const blockContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            anomalyMutation.mutate("right_click");
            toast.error("⚠️ Klik kanan tidak diizinkan selama ujian!");
        };
        document.addEventListener("contextmenu", blockContextMenu);
        return () => document.removeEventListener("contextmenu", blockContextMenu);
    }, [anomalyMutation, toast]);

    // 4. Window blur (focus loss — e.g. Alt+Tab)
    useEffect(() => {
        const handleBlur = () => {
            anomalyMutation.mutate("window_blur");
            toast.error("⚠️ Peringatan: Jendela ujian kehilangan fokus! Aktivitas ini tercatat.");
        };
        window.addEventListener("blur", handleBlur);
        return () => window.removeEventListener("blur", handleBlur);
    }, [anomalyMutation, toast]);

    // 5. Fullscreen exit detection — re-enter fullscreen automatically
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                anomalyMutation.mutate("fullscreen_exit");
                toast.error("⚠️ Peringatan: Anda keluar dari mode fullscreen! Aktivitas ini tercatat.");
                // Attempt to re-enter fullscreen
                setTimeout(() => {
                    document.documentElement.requestFullscreen().catch(() => { });
                }, 500);
            }
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, [anomalyMutation, toast]);

    const questions = useMemo(() => sessionQuery.data?.questions ?? [], [sessionQuery.data]);
    const currentQuestion = questions[currentIndex] ?? null;

    const updateAnswer = (questionId: string, nextValue: unknown) => {
        setAnswerMap((old) => ({
            ...old,
            [questionId]: {
                answer: nextValue,
                is_bookmarked: old[questionId]?.is_bookmarked ?? false,
            },
        }));
        setDirtyIds((old) => {
            const next = new Set(old);
            next.add(questionId);
            return next;
        });
    };

    const toggleBookmark = (questionId: string) => {
        setAnswerMap((old) => ({
            ...old,
            [questionId]: {
                answer: old[questionId]?.answer ?? null,
                is_bookmarked: !(old[questionId]?.is_bookmarked ?? false),
            },
        }));
        setDirtyIds((old) => {
            const next = new Set(old);
            next.add(questionId);
            return next;
        });
    };

    if (sessionQuery.isLoading) {
        return <p className="state-text">Memuat sesi ujian...</p>;
    }

    if (sessionQuery.isError || !sessionQuery.data) {
        return (
            <p className="state-text error">
                {errorMessageForCode(
                    sessionQuery.error,
                    {
                        NOT_FOUND: "Submission tidak ditemukan.",
                        FORBIDDEN: "Akses ditolak untuk sesi ini.",
                    },
                    "Gagal memuat sesi ujian.",
                )}
            </p>
        );
    }

    if (sessionQuery.data.status !== "in_progress") {
        return (
            <section className="card">
                <h3 className="section-title">Sesi Sudah Selesai</h3>
                <p className="state-text">Submission ini sudah final. Lihat hasil ujian untuk detail skor.</p>
                <button
                    className="btn"
                    onClick={() => navigate({ to: "/app/my-exams/result/$submissionId", params: { submissionId } })}
                >
                    Lihat Hasil
                </button>
            </section>
        );
    }

    return (
        <section className="panel-grid exam-session-fullscreen">
            <section className="card row" style={{ justifyContent: "space-between" }}>
                <div>
                    <h3 className="section-title" style={{ marginBottom: 4 }}>{sessionQuery.data.exam_title}</h3>
                    <p className="state-text">Submission: {sessionIdShort(submissionId)}</p>
                </div>
                <div className="row gap-sm">
                    <span className={`pill ${remainingSeconds <= 300 ? "p-rose" : "p-neu"}`}>
                        Sisa waktu: {formatRemaining(remainingSeconds)}
                    </span>
                    <button className="btn btn-danger" onClick={() => setShowFinishConfirm(true)}>
                        Finish
                    </button>
                </div>
            </section>

            <section className="card">
                <div className="row gap-sm exam-nav-grid" style={{ flexWrap: "wrap" }}>
                    {questions.map((question, idx) => (
                        <button
                            key={question.question_id}
                            className={`btn btn-ghost ${idx === currentIndex ? "active-nav" : ""}`}
                            onClick={() => setCurrentIndex(idx)}
                        >
                            {idx + 1}
                            {answerMap[question.question_id]?.is_bookmarked ? " *" : ""}
                        </button>
                    ))}
                </div>
            </section>

            {currentQuestion ? (
                <section className="card panel-grid">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                        <h4 style={{ margin: 0 }}>Soal #{currentIndex + 1}</h4>
                        <button
                            className="btn btn-ghost"
                            onClick={() => toggleBookmark(currentQuestion.question_id)}
                        >
                            {answerMap[currentQuestion.question_id]?.is_bookmarked ? "Unbookmark" : "Bookmark"}
                        </button>
                    </div>
                    <p>{currentQuestion.content}</p>
                    {renderAnswerInput(
                        currentQuestion,
                        answerMap[currentQuestion.question_id]?.answer,
                        (next) => updateAnswer(currentQuestion.question_id, next),
                    )}
                    <div className="row gap-sm">
                        <button
                            className="btn btn-ghost"
                            disabled={currentIndex === 0}
                            onClick={() => setCurrentIndex((old) => Math.max(0, old - 1))}
                        >
                            Prev
                        </button>
                        <button
                            className="btn btn-ghost"
                            disabled={currentIndex >= questions.length - 1}
                            onClick={() => setCurrentIndex((old) => Math.min(questions.length - 1, old + 1))}
                        >
                            Next
                        </button>
                    </div>
                </section>
            ) : null}

            {saveAnswersMutation.isError ? (
                <p className="state-text error">
                    {errorMessageForCode(
                        saveAnswersMutation.error,
                        {
                            SUBMISSION_FINISHED: "Sesi sudah selesai, jawaban tidak bisa diubah.",
                        },
                        "Gagal menyimpan jawaban otomatis.",
                    )}
                </p>
            ) : null}

            <ConfirmDialog
                open={showFinishConfirm}
                title="Selesaikan ujian?"
                description="Setelah finish, jawaban tidak bisa diubah lagi."
                confirmLabel={finishMutation.isPending ? "Finishing..." : "Finish"}
                onCancel={() => setShowFinishConfirm(false)}
                onConfirm={() => {
                    if (dirtyIds.size > 0) {
                        const payload: SubmissionAnswerInput[] = Array.from(dirtyIds).map((questionId) => ({
                            question_id: questionId,
                            answer: answerMap[questionId]?.answer,
                            is_bookmarked: answerMap[questionId]?.is_bookmarked ?? false,
                        }));
                                saveAnswersMutation.mutate(payload, {
                                    onSuccess: () => {
                                        setDirtyIds(new Set());
                                        triggerFinish();
                                    },
                                });
                                return;
                            }
                    triggerFinish();
                }}
            />
        </section>
    );
}

function sessionIdShort(id: string): string {
    return id.slice(0, 8);
}
