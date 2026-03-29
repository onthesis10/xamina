import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CorePageTour } from "@/components/CorePageTour";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { questionApi } from "@/features/question/question.api";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { CreateExamDto, ExamDto, ExamStatus, PublishPrecheckResult } from "@/types/api.types";

import { examApi } from "./exam.api";
import { dateToLocalDateTimeInput, localDateTimePreview, localDateTimeToUtcIso } from "./exam.datetime";
import { ScheduleFields } from "./ScheduleFields";

type WizardStep = 1 | 2 | 3 | 4;
type PrecheckIssueGroup = "Schedule" | "Question" | "State" | "Conflict" | "Other";

const EMPTY_EXAM_FORM: CreateExamDto = {
    title: "",
    description: "",
    duration_minutes: 90,
    pass_score: 70,
    shuffle_questions: false,
    shuffle_options: false,
    start_at: "",
    end_at: "",
};

const STEP_LABELS: Record<WizardStep, string> = {
    1: "Basic Info",
    2: "Settings",
    3: "Schedule",
    4: "Preview",
};

const STEP_NEXT_LABELS: Record<WizardStep, string> = {
    1: "Next: Settings",
    2: "Next: Schedule",
    3: "Next: Preview",
    4: "Finish",
};

const WIZARD_STEPS: WizardStep[] = [1, 2, 3, 4];

function withDurationWindow(start: Date, durationMinutes: number): { start: string; end: string } {
    const nextStart = new Date(start);
    const nextEnd = new Date(start.getTime() + durationMinutes * 60_000);
    return {
        start: dateToLocalDateTimeInput(nextStart),
        end: dateToLocalDateTimeInput(nextEnd),
    };
}

export function ExamsPanel() {
    const qc = useQueryClient();
    const toast = useToast();
    const navigate = useNavigate();
    const [selectedExamId, setSelectedExamId] = useState<string>("");
    const [confirmAction, setConfirmAction] = useState<"publish" | "unpublish" | null>(null);
    const [search, setSearch] = useState("");
    const [newExam, setNewExam] = useState<CreateExamDto>(EMPTY_EXAM_FORM);
    const [wizardStep, setWizardStep] = useState<WizardStep>(1);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
    const [questionSearch, setQuestionSearch] = useState("");
    const [reorderIds, setReorderIds] = useState<string[]>([]);
    const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null);
    const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
    const [precheck, setPrecheck] = useState<PublishPrecheckResult | null>(null);
    const [precheckRunAt, setPrecheckRunAt] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const examsQuery = useQuery({
        queryKey: ["exams", search],
        queryFn: () => examApi.list({ page: 1, page_size: 50, search }),
    });

    const questionsQuery = useQuery({
        queryKey: ["questions-for-exam"],
        queryFn: () => questionApi.list({ page: 1, page_size: 200 }),
    });

    const examDetailQuery = useQuery({
        queryKey: ["exam-detail", selectedExamId],
        enabled: !!selectedExamId,
        queryFn: () => examApi.getOne(selectedExamId),
    });

    const attachedQuestionIds = useMemo(
        () => (examDetailQuery.data?.questions ?? []).map((item) => item.question_id),
        [examDetailQuery.data],
    );
    const selectedExam = useMemo(
        () => examsQuery.data?.data?.find((exam) => exam.id === selectedExamId) ?? null,
        [examsQuery.data, selectedExamId],
    );
    const selectedExamStatus = useMemo<ExamStatus | null>(() => {
        const status = examDetailQuery.data?.exam.status ?? selectedExam?.status ?? null;
        if (status === "draft" || status === "published") {
            return status;
        }
        return null;
    }, [examDetailQuery.data, selectedExam]);
    const isDraftExam = selectedExamStatus === "draft";
    const isPublishedExam = selectedExamStatus === "published";
    const questionMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const question of questionsQuery.data?.data ?? []) {
            map.set(question.id, question.content);
        }
        return map;
    }, [questionsQuery.data]);
    const isReorderDirty = useMemo(
        () => attachedQuestionIds.join(",") !== reorderIds.join(","),
        [attachedQuestionIds, reorderIds],
    );

    useEffect(() => {
        setPrecheck(null);
        setPrecheckRunAt(null);
        setSelectedQuestionIds([]);
        setQuestionSearch("");
        setActionError(null);
        setReorderIds([]);
        setDraggingQuestionId(null);
        setDragOverQuestionId(null);
    }, [selectedExamId]);

    useEffect(() => {
        setReorderIds(attachedQuestionIds);
    }, [attachedQuestionIds]);

    useEffect(() => {
        setPrecheck(null);
        setPrecheckRunAt(null);
    }, [selectedExamStatus]);

    const createExamMutation = useMutation({
        mutationFn: (payload: CreateExamDto) => examApi.create(payload),
        onMutate: () => {
            setFormError(null);
        },
        onSuccess: async () => {
            setNewExam(EMPTY_EXAM_FORM);
            setWizardStep(1);
            await qc.invalidateQueries({ queryKey: ["exams"] });
            toast.success("Ujian berhasil dibuat.");
        },
        onError: (error) => {
            const message = errorMessageForCode(
                error,
                {
                    VALIDATION_ERROR: "Data ujian tidak valid. Cek judul, durasi, dan jadwal.",
                    FORBIDDEN: "Akses ditolak untuk membuat ujian.",
                },
                "Gagal membuat ujian.",
            );
            setFormError(message);
            toast.error(message);
        },
    });

    const attachMutation = useMutation({
        mutationFn: () => examApi.attachQuestions(selectedExamId, { question_ids: selectedQuestionIds }),
        onMutate: () => {
            setActionError(null);
        },
        onSuccess: async () => {
            setSelectedQuestionIds([]);
            setPrecheck(null);
            setPrecheckRunAt(null);
            await qc.invalidateQueries({ queryKey: ["exam-detail", selectedExamId] });
            toast.success("Soal berhasil di-attach.");
        },
        onError: (error) => {
            setActionError(
                errorMessageForCode(
                    error,
                    {
                        VALIDATION_ERROR: "Pilih minimal satu soal untuk di-attach.",
                        ATTACH_FAILED: "Exam tidak bisa diubah. Pastikan status masih draft.",
                        FORBIDDEN: "Akses ditolak untuk attach soal.",
                    },
                    "Gagal attach soal ke ujian.",
                ),
            );
        },
    });

    const reorderMutation = useMutation({
        mutationFn: () => examApi.reorderQuestions(selectedExamId, { question_ids: reorderIds }),
        onMutate: () => {
            setActionError(null);
        },
        onSuccess: async () => {
            setPrecheck(null);
            setPrecheckRunAt(null);
            await qc.invalidateQueries({ queryKey: ["exam-detail", selectedExamId] });
            toast.success("Urutan soal berhasil disimpan.");
        },
        onError: (error) => {
            setActionError(
                errorMessageForCode(
                    error,
                    {
                        VALIDATION_ERROR: "Urutan soal tidak valid. Pastikan semua soal terikut tepat satu kali.",
                        FORBIDDEN: "Akses ditolak untuk reorder soal ujian.",
                    },
                    "Gagal menyimpan urutan soal.",
                ),
            );
        },
    });

    const detachMutation = useMutation({
        mutationFn: (questionId: string) => examApi.detachQuestion(selectedExamId, questionId),
        onMutate: () => {
            setActionError(null);
        },
        onSuccess: async () => {
            setPrecheck(null);
            setPrecheckRunAt(null);
            await qc.invalidateQueries({ queryKey: ["exam-detail", selectedExamId] });
            toast.success("Soal berhasil di-detach.");
        },
        onError: (error) => {
            setActionError(
                errorMessageForCode(
                    error,
                    {
                        ATTACH_FAILED: "Exam tidak bisa diubah. Pastikan status masih draft.",
                        VALIDATION_ERROR: "Soal tidak ditemukan pada daftar attach exam ini.",
                        FORBIDDEN: "Akses ditolak untuk detach soal ujian.",
                    },
                    "Gagal detach soal.",
                ),
            );
        },
    });

    const precheckMutation = useMutation({
        mutationFn: () => examApi.publishPrecheck(selectedExamId),
        onMutate: () => {
            setActionError(null);
        },
        onSuccess: (result) => {
            setPrecheck(result);
            setPrecheckRunAt(new Date().toISOString());
            if (!result.publishable) {
                setActionError("Publish belum bisa dilakukan. Lihat hasil precheck di bawah.");
            } else {
                toast.success("Precheck publish lolos.");
            }
        },
        onError: (error) => {
            setActionError(
                errorMessageForCode(
                    error,
                    {
                        FORBIDDEN: "Akses ditolak untuk precheck publish.",
                        NOT_FOUND: "Exam tidak ditemukan untuk precheck publish.",
                    },
                    "Gagal menjalankan publish precheck.",
                ),
            );
        },
    });

    const publishMutation = useMutation({
        mutationFn: () => examApi.publish(selectedExamId),
        onMutate: () => {
            setActionError(null);
        },
        onSuccess: async () => {
            setConfirmAction(null);
            setPrecheck(null);
            setPrecheckRunAt(null);
            await qc.invalidateQueries({ queryKey: ["exams"] });
            await qc.invalidateQueries({ queryKey: ["exam-detail", selectedExamId] });
            toast.success("Ujian berhasil dipublish.");
        },
        onError: (error) => {
            setActionError(
                errorMessageForCode(
                    error,
                    {
                        PUBLISH_FAILED: "Publish gagal. Jalankan precheck dan perbaiki issue dulu.",
                        FORBIDDEN: "Akses ditolak untuk publish ujian.",
                    },
                    "Gagal publish ujian.",
                ),
            );
        },
    });

    const unpublishMutation = useMutation({
        mutationFn: () => examApi.unpublish(selectedExamId),
        onMutate: () => {
            setActionError(null);
        },
        onSuccess: async () => {
            setConfirmAction(null);
            setPrecheck(null);
            setPrecheckRunAt(null);
            await qc.invalidateQueries({ queryKey: ["exams"] });
            await qc.invalidateQueries({ queryKey: ["exam-detail", selectedExamId] });
            toast.success("Ujian berhasil di-unpublish.");
        },
        onError: (error) => {
            setActionError(
                errorMessageForCode(
                    error,
                    {
                        FORBIDDEN: "Akses ditolak untuk unpublish ujian.",
                    },
                    "Gagal unpublish ujian.",
                ),
            );
        },
    });

    const exams = useMemo(() => examsQuery.data?.data ?? [], [examsQuery.data]);
    const questions = useMemo(() => questionsQuery.data?.data ?? [], [questionsQuery.data]);
    const filteredQuestions = useMemo(() => {
        const keyword = questionSearch.trim().toLowerCase();
        if (!keyword) return questions;
        return questions.filter((question) => {
            const haystack = `${question.content} ${question.topic ?? ""} ${question.difficulty ?? ""} ${question.type}`.toLowerCase();
            return haystack.includes(keyword);
        });
    }, [questions, questionSearch]);
    const publishIssueSummary = useMemo(() => {
        if (!precheck || precheck.issues.length === 0) return null;
        return precheck.issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
    }, [precheck]);

    const scheduleHasStart = !!newExam.start_at?.trim();
    const scheduleHasEnd = !!newExam.end_at?.trim();
    const parsedStartUtc = localDateTimeToUtcIso(newExam.start_at);
    const parsedEndUtc = localDateTimeToUtcIso(newExam.end_at);
    const startLocalPreview = localDateTimePreview(newExam.start_at);
    const endLocalPreview = localDateTimePreview(newExam.end_at);
    const startInvalid = scheduleHasStart && !parsedStartUtc;
    const endInvalid = scheduleHasEnd && !parsedEndUtc;
    const scheduleInvalidOrder = !!parsedStartUtc && !!parsedEndUtc && parsedStartUtc >= parsedEndUtc;
    const scheduleMissingPair = scheduleHasStart !== scheduleHasEnd;
    const scheduleMissingBoth = !scheduleHasStart && !scheduleHasEnd;
    const scheduleMessage = scheduleMissingBoth
        ? "Start At dan End At wajib diisi."
        : scheduleMissingPair
            ? "Start At dan End At harus diisi berpasangan."
            : startInvalid || endInvalid
                ? "Format tanggal/jam tidak valid."
                : scheduleInvalidOrder
                    ? "Jadwal tidak valid: start harus sebelum end."
                    : null;
    const wizardStepErrors = useMemo(() => {
        if (wizardStep === 1) {
            if (!newExam.title?.trim()) return ["Judul ujian wajib diisi."];
            return [];
        }
        if (wizardStep === 2) {
            const errors: string[] = [];
            if ((newExam.duration_minutes ?? 0) <= 0) {
                errors.push("Durasi ujian harus lebih dari 0 menit.");
            }
            const passScore = newExam.pass_score ?? 0;
            if (passScore < 0 || passScore > 100) {
                errors.push("Pass score harus berada di rentang 0-100.");
            }
            return errors;
        }
        if (wizardStep === 3) {
            const errors: string[] = [];
            if (scheduleMessage) {
                errors.push(scheduleMessage);
            }
            if (startInvalid) {
                errors.push("Format Start At tidak valid.");
            }
            if (endInvalid) {
                errors.push("Format End At tidak valid.");
            }
            return errors;
        }
        return [];
    }, [wizardStep, newExam, scheduleMessage, startInvalid, endInvalid]);
    const canGoNext = wizardStepErrors.length === 0;
    const groupedPrecheckIssues = useMemo<Array<{ group: PrecheckIssueGroup; items: PublishPrecheckResult["issues"] }>>(() => {
        if (!precheck || precheck.issues.length === 0) return [];
        const bucket: Record<PrecheckIssueGroup, PublishPrecheckResult["issues"]> = {
            Schedule: [],
            Question: [],
            State: [],
            Conflict: [],
            Other: [],
        };
        for (const issue of precheck.issues) {
            if (issue.code === "NO_QUESTIONS") {
                bucket.Question.push(issue);
            } else if (issue.code === "NOT_DRAFT") {
                bucket.State.push(issue);
            } else if (issue.code === "SCHEDULE_CONFLICT") {
                bucket.Conflict.push(issue);
            } else if (issue.code.includes("SCHEDULE")) {
                bucket.Schedule.push(issue);
            } else {
                bucket.Other.push(issue);
            }
        }
        return (Object.keys(bucket) as PrecheckIssueGroup[])
            .filter((group) => bucket[group].length > 0)
            .map((group) => ({ group, items: bucket[group] }));
    }, [precheck]);

    const submitCreateExam = () => {
        if (scheduleMessage) {
            setFormError(scheduleMessage);
            return;
        }
        const startAt = parsedStartUtc;
        const endAt = parsedEndUtc;
        if (!startAt || !endAt) {
            setFormError("Format jadwal tidak valid. Gunakan tanggal dan jam yang benar.");
            return;
        }
        createExamMutation.mutate({
            ...newExam,
            start_at: startAt,
            end_at: endAt,
        });
    };

    const applyNextDurationFromNow = (minutes: number) => {
        const window = withDurationWindow(new Date(), minutes);
        setNewExam((old) => ({ ...old, start_at: window.start, end_at: window.end }));
    };

    const applyTomorrowMorningPreset = () => {
        const now = new Date();
        const tomorrowMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0, 0, 0);
        const window = withDurationWindow(tomorrowMorning, 60);
        setNewExam((old) => ({ ...old, start_at: window.start, end_at: window.end }));
    };

    const onDropQuestion = (targetId: string) => {
        if (!isDraftExam) return;
        if (!draggingQuestionId || draggingQuestionId === targetId) return;
        const from = reorderIds.indexOf(draggingQuestionId);
        const to = reorderIds.indexOf(targetId);
        if (from < 0 || to < 0) return;
        const next = [...reorderIds];
        next.splice(from, 1);
        next.splice(to, 0, draggingQuestionId);
        setReorderIds(next);
        setDragOverQuestionId(null);
        setDraggingQuestionId(null);
    };

    const moveQuestionByOffset = (questionId: string, offset: -1 | 1) => {
        if (!isDraftExam) return;
        const from = reorderIds.indexOf(questionId);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= reorderIds.length) return;
        const next = [...reorderIds];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        setReorderIds(next);
    };

    const renderWizardContent = () => {
        if (wizardStep === 1) {
            return (
                <div className="panel-grid">
                    <FormField label="Judul Ujian">
                        <input
                            className="input"
                            value={newExam.title}
                            onChange={(e) => setNewExam((old) => ({ ...old, title: e.target.value }))}
                            aria-label="Exam title"
                        />
                    </FormField>
                    <FormField label="Deskripsi">
                        <textarea
                            className="textarea"
                            rows={3}
                            value={newExam.description ?? ""}
                            onChange={(e) => setNewExam((old) => ({ ...old, description: e.target.value }))}
                            aria-label="Exam description"
                        />
                    </FormField>
                </div>
            );
        }

        if (wizardStep === 2) {
            return (
                <div className="grid-4">
                    <FormField label="Durasi (menit)">
                        <input
                            className="input"
                            type="number"
                            min={1}
                            value={newExam.duration_minutes}
                            onChange={(e) => setNewExam((old) => ({ ...old, duration_minutes: Number(e.target.value) }))}
                            aria-label="Duration minutes"
                        />
                    </FormField>
                    <FormField label="Pass Score">
                        <input
                            className="input"
                            type="number"
                            min={0}
                            max={100}
                            value={newExam.pass_score}
                            onChange={(e) => setNewExam((old) => ({ ...old, pass_score: Number(e.target.value) }))}
                            aria-label="Pass score"
                        />
                    </FormField>
                    <FormField label="Shuffle Soal">
                        <input
                            type="checkbox"
                            checked={!!newExam.shuffle_questions}
                            onChange={(e) => setNewExam((old) => ({ ...old, shuffle_questions: e.target.checked }))}
                            aria-label="Shuffle questions"
                        />
                    </FormField>
                    <FormField label="Shuffle Opsi">
                        <input
                            type="checkbox"
                            checked={!!newExam.shuffle_options}
                            onChange={(e) => setNewExam((old) => ({ ...old, shuffle_options: e.target.checked }))}
                            aria-label="Shuffle options"
                        />
                    </FormField>
                </div>
            );
        }

        if (wizardStep === 3) {
            return (
                <div className="grid-3">
                    <ScheduleFields
                        startAt={newExam.start_at ?? ""}
                        endAt={newExam.end_at ?? ""}
                        startError={startInvalid ? "Format Start At tidak valid." : null}
                        endError={endInvalid ? "Format End At tidak valid." : null}
                        scheduleError={scheduleMessage}
                        startLocalPreview={startLocalPreview}
                        endLocalPreview={endLocalPreview}
                        startUtcPreview={parsedStartUtc}
                        endUtcPreview={parsedEndUtc}
                        onApplyNext30Minutes={() => applyNextDurationFromNow(30)}
                        onApplyNext60Minutes={() => applyNextDurationFromNow(60)}
                        onApplyTomorrowMorning={applyTomorrowMorningPreset}
                        onStartChange={(value) => setNewExam((old) => ({ ...old, start_at: value }))}
                        onEndChange={(value) => setNewExam((old) => ({ ...old, end_at: value }))}
                    />
                </div>
            );
        }

        return (
            <section className="card" style={{ boxShadow: "none" }}>
                <h4>Preview Ujian</h4>
                <p><strong>Title:</strong> {newExam.title || "-"}</p>
                <p><strong>Description:</strong> {newExam.description || "-"}</p>
                <p><strong>Duration:</strong> {newExam.duration_minutes} min</p>
                <p><strong>Pass score:</strong> {newExam.pass_score}</p>
                <p><strong>Shuffle questions:</strong> {newExam.shuffle_questions ? "Yes" : "No"}</p>
                <p><strong>Shuffle options:</strong> {newExam.shuffle_options ? "Yes" : "No"}</p>
                <p><strong>Start:</strong> {newExam.start_at || "-"}</p>
                <p><strong>End:</strong> {newExam.end_at || "-"}</p>
            </section>
        );
    };

    return (
        <section className="panel-grid" data-tour="exams">
            <CorePageTour
                page="exams"
                title="Kelola publish flow di Exams"
                description="Halaman ini menjadi pusat wizard ujian, attach soal, precheck, dan publish/unpublish."
                bullets={[
                    "Buat exam lewat wizard, lalu attach soal dari bank soal tenant aktif.",
                    "Gunakan precheck sebelum publish untuk cegah konflik jadwal dan state invalid.",
                    "Monitor real-time hanya aktif untuk exam yang sudah published.",
                ]}
            />
            <section className="card">
                <h3 className="section-title">Buat Ujian (Wizard)</h3>
                <p className="state-text">Step {wizardStep}/4 - {STEP_LABELS[wizardStep]}</p>
                <div className="wizard-stepper">
                    {WIZARD_STEPS.map((stepNumber) => {
                        const statusClass =
                            stepNumber < wizardStep ? "done" : stepNumber === wizardStep ? "current" : "todo";
                        return (
                            <span key={stepNumber} className={`wizard-step ${statusClass}`}>
                                {stepNumber}. {STEP_LABELS[stepNumber]}
                            </span>
                        );
                    })}
                </div>
                {wizardStepErrors.length > 0 ? (
                    <div className="wizard-errors">
                        <p className="state-text error"><strong>Perlu diperbaiki sebelum lanjut:</strong></p>
                        <ul>
                            {wizardStepErrors.map((error) => (
                                <li key={error} className="state-text error">{error}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {renderWizardContent()}
                {formError ? <p className="state-text error">{formError}</p> : null}
                <div className="row gap-sm" style={{ marginTop: 12 }}>
                    <button
                        className="btn btn-ghost"
                        onClick={() => setWizardStep((old) => (old > 1 ? ((old - 1) as WizardStep) : old))}
                        disabled={wizardStep === 1}
                    >
                        Back
                    </button>
                    {wizardStep < 4 ? (
                        <button
                            className="btn"
                            onClick={() => setWizardStep((old) => (old < 4 ? ((old + 1) as WizardStep) : old))}
                            disabled={!canGoNext}
                        >
                            {STEP_NEXT_LABELS[wizardStep]}
                        </button>
                    ) : (
                        <button className="btn" onClick={submitCreateExam} disabled={createExamMutation.isPending}>
                            {createExamMutation.isPending ? "Menyimpan..." : "Simpan Ujian"}
                        </button>
                    )}
                </div>
            </section>

            <DataTable
                title="Daftar Ujian"
                rows={exams}
                loading={examsQuery.isLoading}
                error={
                    examsQuery.isError
                        ? errorMessageForCode(
                            examsQuery.error,
                            {
                                FORBIDDEN: "Akses ditolak untuk melihat daftar ujian.",
                            },
                            "Gagal mengambil data ujian.",
                        )
                        : null
                }
                emptyLabel="Belum ada data ujian."
                actions={
                    <input
                        className="input"
                        placeholder="search ujian"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search exams"
                    />
                }
                columns={[
                    { key: "title", header: "Title", render: (examRow: ExamDto) => examRow.title },
                    { key: "duration", header: "Duration", render: (examRow: ExamDto) => `${examRow.duration_minutes} min` },
                    { key: "status", header: "Status", render: (examRow: ExamDto) => <StatusBadge value={examRow.status} /> },
                    {
                        key: "manage",
                        header: "Action",
                        render: (examRow: ExamDto) => (
                            <span className="row gap-sm">
                                <button className="btn btn-ghost" onClick={() => setSelectedExamId(examRow.id)}>
                                    Manage
                                </button>
                                {examRow.status === "published" ? (
                                    <button
                                        className="btn"
                                        style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                                        onClick={() => navigate({ to: "/app/exams/monitor/$examId", params: { examId: examRow.id } })}
                                    >
                                        📡 Monitor
                                    </button>
                                ) : null}
                            </span>
                        ),
                    },
                ]}
            />

            {selectedExamId ? (
                <section className="card">
                    <h3 className="section-title">Manage Exam</h3>
                    <p className="state-text">Selected exam: {selectedExamId}</p>
                    <p className="state-text">Status: {selectedExamStatus ?? "-"}</p>
                    {examDetailQuery.isLoading ? <p className="state-text">Memuat detail exam...</p> : null}
                    {examDetailQuery.isError ? (
                        <p className="state-text error">
                            {errorMessageForCode(
                                examDetailQuery.error,
                                {
                                    FORBIDDEN: "Akses ditolak untuk melihat detail exam.",
                                    NOT_FOUND: "Exam tidak ditemukan.",
                                },
                                "Gagal memuat detail exam.",
                            )}
                        </p>
                    ) : null}

                    <section className="card" style={{ boxShadow: "none" }}>
                        <h4>Attach Soal dari Bank</h4>
                        <div className="panel-grid">
                            <input
                                className="input"
                                placeholder="Cari soal (konten/topic/type)"
                                value={questionSearch}
                                onChange={(event) => setQuestionSearch(event.target.value)}
                                aria-label="Search question bank for attach"
                            />
                            <small className="state-text">
                                Selected {selectedQuestionIds.length} dari {filteredQuestions.length} soal yang terlihat.
                            </small>
                        </div>
                        <div className="table-wrap attach-picker">
                            {questionsQuery.isLoading ? <p className="state-text">Memuat bank soal...</p> : null}
                            {questionsQuery.isError ? (
                                <p className="state-text error">
                                    {errorMessageForCode(
                                        questionsQuery.error,
                                        { FORBIDDEN: "Akses ditolak untuk membaca bank soal." },
                                        "Gagal memuat bank soal.",
                                    )}
                                </p>
                            ) : null}
                            {!questionsQuery.isLoading && !questionsQuery.isError && filteredQuestions.length === 0 ? (
                                <p className="state-text">Tidak ada soal yang cocok dengan pencarian.</p>
                            ) : null}
                            {filteredQuestions.map((question) => (
                                <label key={question.id} className="attach-item">
                                    <input
                                        type="checkbox"
                                        checked={selectedQuestionIds.includes(question.id)}
                                        disabled={!isDraftExam || attachMutation.isPending}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedQuestionIds((old) => Array.from(new Set([...old, question.id])));
                                            } else {
                                                setSelectedQuestionIds((old) => old.filter((id) => id !== question.id));
                                            }
                                        }}
                                        aria-label={`Select question ${question.id}`}
                                    />
                                    <span className="question-content-clamp">{question.content}</span>
                                    <span className="state-text">[{question.type}]</span>
                                </label>
                            ))}
                        </div>
                        <button
                            className="btn"
                            onClick={() => attachMutation.mutate()}
                            disabled={!isDraftExam || attachMutation.isPending || selectedQuestionIds.length === 0}
                        >
                            {attachMutation.isPending ? "Attaching..." : `Attach Questions (${selectedQuestionIds.length})`}
                        </button>
                        {!isDraftExam ? <p className="state-text">Attach hanya tersedia saat exam berstatus draft.</p> : null}
                    </section>

                    <section className="card" style={{ boxShadow: "none" }}>
                        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                            <h4>Attached Questions Order (Drag & Drop)</h4>
                            {isReorderDirty ? <span className="pill p-amber">Unsaved order changes</span> : null}
                        </div>
                        <p className="state-text">Tarik item untuk reorder, atau gunakan tombol naik/turun di kanan.</p>
                        {reorderIds.length === 0 ? (
                            <p className="state-text">Belum ada soal yang di-attach.</p>
                        ) : (
                            <div className="panel-grid">
                                {reorderIds.map((questionId, index) => (
                                    <div
                                        key={questionId}
                                        className={`card reorder-item ${draggingQuestionId === questionId ? "dragging" : ""} ${dragOverQuestionId === questionId ? "dragover" : ""}`}
                                        style={{ boxShadow: "none", cursor: "grab", padding: 10 }}
                                        draggable={isDraftExam}
                                        onDragStart={() => {
                                            if (isDraftExam) {
                                                setDraggingQuestionId(questionId);
                                            }
                                        }}
                                        onDragEnd={() => {
                                            setDraggingQuestionId(null);
                                            setDragOverQuestionId(null);
                                        }}
                                        onDragEnter={() => {
                                            if (isDraftExam && draggingQuestionId && draggingQuestionId !== questionId) {
                                                setDragOverQuestionId(questionId);
                                            }
                                        }}
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={() => onDropQuestion(questionId)}
                                    >
                                        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                                            <span className="row gap-sm">
                                                <strong>#{index + 1}</strong>
                                                <span className="question-content-clamp">{questionMap.get(questionId) ?? questionId}</span>
                                            </span>
                                            <span className="row gap-sm">
                                                <button
                                                    className="btn btn-ghost"
                                                    onClick={() => moveQuestionByOffset(questionId, -1)}
                                                    disabled={!isDraftExam || index === 0}
                                                >
                                                    Up
                                                </button>
                                                <button
                                                    className="btn btn-ghost"
                                                    onClick={() => moveQuestionByOffset(questionId, 1)}
                                                    disabled={!isDraftExam || index === reorderIds.length - 1}
                                                >
                                                    Down
                                                </button>
                                                <button
                                                    className="btn btn-ghost"
                                                    onClick={() => detachMutation.mutate(questionId)}
                                                    disabled={detachMutation.isPending || !isDraftExam}
                                                >
                                                    Detach
                                                </button>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="row gap-sm" style={{ marginTop: 8 }}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => setReorderIds(attachedQuestionIds)}
                                disabled={!isDraftExam || !isReorderDirty}
                            >
                                Reset Order
                            </button>
                            <button
                                className="btn"
                                onClick={() => reorderMutation.mutate()}
                                disabled={!isDraftExam || !isReorderDirty || reorderMutation.isPending}
                            >
                                {reorderMutation.isPending ? "Saving..." : "Save Order"}
                            </button>
                        </div>
                        {!isDraftExam ? <p className="state-text">Reorder dan detach hanya tersedia saat status draft.</p> : null}
                    </section>

                    <section className="card" style={{ boxShadow: "none" }}>
                        <h4>Publish Precheck</h4>
                        <div className="row gap-sm" style={{ marginBottom: 8 }}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => precheckMutation.mutate()}
                                disabled={!isDraftExam || precheckMutation.isPending}
                            >
                                {precheckMutation.isPending ? "Checking..." : "Run Precheck"}
                            </button>
                            <button
                                className="btn"
                                onClick={() => setConfirmAction("publish")}
                                disabled={!isDraftExam || !precheck?.publishable || publishMutation.isPending}
                            >
                                {precheck?.publishable ? "Publish Exam" : "Publish (Precheck Required)"}
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => setConfirmAction("unpublish")}
                                disabled={!isPublishedExam || unpublishMutation.isPending}
                            >
                                Unpublish
                            </button>
                        </div>

                        {precheck ? (
                            <div className="panel-grid precheck-panel">
                                <div className="row gap-sm">
                                    <span className={`pill ${precheck.publishable ? "p-green" : "p-rose"}`}>
                                        Publishable: {precheck.publishable ? "Yes" : "No"}
                                    </span>
                                    <span className="pill p-neu">Status: {precheck.status}</span>
                                    <span className="pill p-neu">Question count: {precheck.question_count}</span>
                                </div>
                                {precheckRunAt ? <small className="state-text">Last precheck: {new Date(precheckRunAt).toLocaleString()}</small> : null}
                                {groupedPrecheckIssues.length > 0 ? (
                                    <div className="panel-grid">
                                        {groupedPrecheckIssues.map((group) => (
                                            <section key={group.group} className="precheck-group">
                                                <h5>{group.group} Issues ({group.items.length})</h5>
                                                <ul>
                                                    {group.items.map((issue) => (
                                                        <li key={`${group.group}-${issue.code}-${issue.message}`}>
                                                            <strong>{issue.code}</strong>: {issue.message}
                                                            {issue.code === "SCHEDULE_CONFLICT" &&
                                                                issue.details?.conflicting_exams &&
                                                                issue.details.conflicting_exams.length > 0 ? (
                                                                <div className="state-text">
                                                                    Bentrok dengan:{" "}
                                                                    {issue.details.conflicting_exams
                                                                        .map((item) => {
                                                                            const start = new Date(item.start_at).toLocaleString();
                                                                            const end = new Date(item.end_at).toLocaleString();
                                                                            return `${item.title} (${start} - ${end})`;
                                                                        })
                                                                        .join(" | ")}
                                                                </div>
                                                            ) : null}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </section>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="state-text">Tidak ada issue. Publish siap dijalankan.</p>
                                )}
                            </div>
                        ) : (
                            <p className="state-text">Jalankan precheck sebelum publish untuk validasi syarat ujian.</p>
                        )}
                    </section>

                    {publishIssueSummary ? <p className="state-text error">{publishIssueSummary}</p> : null}
                    {actionError ? <p className="state-text error">{actionError}</p> : null}
                </section>
            ) : null}

            <ConfirmDialog
                open={confirmAction !== null}
                title={confirmAction === "publish" ? "Publish exam?" : "Unpublish exam?"}
                description={
                    confirmAction === "publish"
                        ? precheck?.publishable
                            ? "Precheck lolos. Ujian siap dipublish."
                            : "Precheck belum lolos. Tutup dialog ini dan perbaiki issue dulu."
                        : "Exam akan kembali ke status draft."
                }
                confirmLabel={confirmAction === "publish" ? "Publish" : "Unpublish"}
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => {
                    if (confirmAction === "publish") {
                        if (!isDraftExam) {
                            setActionError("Publish hanya tersedia untuk exam status draft.");
                            setConfirmAction(null);
                            return;
                        }
                        if (!precheck?.publishable) {
                            setActionError("Publish diblokir karena precheck belum lolos.");
                            setConfirmAction(null);
                            return;
                        }
                        publishMutation.mutate();
                        return;
                    }
                    if (!isPublishedExam) {
                        setActionError("Unpublish hanya tersedia untuk exam status published.");
                        setConfirmAction(null);
                        return;
                    }
                    unpublishMutation.mutate();
                }}
            />
        </section>
    );
}
