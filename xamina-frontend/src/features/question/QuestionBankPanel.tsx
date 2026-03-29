import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CorePageTour } from "@/components/CorePageTour";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { CreateQuestionDto, QuestionDto, QuestionType } from "@/types/api.types";

import { questionApi } from "./question.api";
import { QuestionImportWizard } from "./QuestionImportWizard";
import { AiGeneratorWidget } from "../ai/AiGeneratorWidget";
import { AiReviewPanel } from "../ai/AiReviewPanel";
import { AiGeneratedQuestion } from "../ai/ai.api";

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
    { value: "multiple_choice", label: "Pilihan Ganda" },
    { value: "true_false", label: "Benar / Salah" },
    { value: "short_answer", label: "Isian" },
];

const PAGE_SIZE = 20;

type ViewMode = "table" | "card";
type UploadState = "idle" | "uploading" | "success" | "error";

interface QuestionFilters {
    search: string;
    topic: string;
    difficulty: string;
    type: QuestionType | "all";
}

interface MultipleChoiceOption {
    id: string;
    label: string;
}

function createEmptyForm(): CreateQuestionDto {
    return {
        type: "multiple_choice",
        content: "",
        options_jsonb: [
            { id: "A", label: "" },
            { id: "B", label: "" },
        ],
        answer_key: "A",
        topic: "",
        difficulty: "",
    };
}

function normalizeMultipleChoiceOptions(options: unknown): MultipleChoiceOption[] {
    if (!Array.isArray(options)) {
        return [
            { id: "A", label: "" },
            { id: "B", label: "" },
        ];
    }
    const normalized = options
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const candidate = item as { id?: unknown; label?: unknown };
            if (typeof candidate.id !== "string" || typeof candidate.label !== "string") return null;
            return {
                id: candidate.id,
                label: candidate.label,
            };
        })
        .filter((item): item is MultipleChoiceOption => item !== null);

    if (normalized.length < 2) {
        return [
            { id: "A", label: "" },
            { id: "B", label: "" },
        ];
    }
    return normalized;
}

function questionToForm(question: QuestionDto): CreateQuestionDto {
    if (question.type === "multiple_choice") {
        const options = normalizeMultipleChoiceOptions(question.options_jsonb);
        const answerKey = typeof question.answer_key === "string" ? question.answer_key : options[0]?.id ?? "A";
        return {
            type: "multiple_choice",
            content: question.content,
            options_jsonb: options,
            answer_key: answerKey,
            topic: question.topic ?? "",
            difficulty: question.difficulty ?? "",
            image_url: question.image_url ?? undefined,
            is_active: question.is_active,
        };
    }

    if (question.type === "true_false") {
        return {
            type: "true_false",
            content: question.content,
            options_jsonb: [{ value: true }, { value: false }],
            answer_key: typeof question.answer_key === "boolean" ? question.answer_key : false,
            topic: question.topic ?? "",
            difficulty: question.difficulty ?? "",
            image_url: question.image_url ?? undefined,
            is_active: question.is_active,
        };
    }

    return {
        type: "short_answer",
        content: question.content,
        options_jsonb: [],
        answer_key:
            typeof question.answer_key === "string" || Array.isArray(question.answer_key)
                ? question.answer_key
                : "",
        topic: question.topic ?? "",
        difficulty: question.difficulty ?? "",
        image_url: question.image_url ?? undefined,
        is_active: question.is_active,
    };
}

function validateQuestionForm(form: CreateQuestionDto): string | null {
    if (!form.content.trim()) {
        return "Konten soal wajib diisi.";
    }

    if (form.type === "multiple_choice") {
        const options = normalizeMultipleChoiceOptions(form.options_jsonb);
        if (options.length < 2) {
            return "Pilihan ganda minimal memiliki 2 opsi.";
        }
        if (options.some((option) => !option.id.trim() || !option.label.trim())) {
            return "Setiap opsi pilihan ganda harus memiliki id dan label.";
        }
        const answerKey = String(form.answer_key ?? "").trim();
        if (!answerKey) {
            return "Jawaban benar (id opsi) wajib diisi.";
        }
        if (!options.some((option) => option.id === answerKey)) {
            return "Jawaban benar harus cocok dengan id opsi.";
        }
        return null;
    }

    if (form.type === "true_false") {
        if (typeof form.answer_key !== "boolean") {
            return "Jawaban true/false harus bernilai boolean.";
        }
        return null;
    }

    if (typeof form.answer_key === "string") {
        return form.answer_key.trim() ? null : "Jawaban isian wajib diisi.";
    }
    if (Array.isArray(form.answer_key)) {
        return form.answer_key.length > 0 ? null : "Jawaban isian array tidak boleh kosong.";
    }
    return "Jawaban isian tidak valid.";
}

function sanitizeToPlainText(input: string): string {
    const div = document.createElement("div");
    div.innerHTML = input;
    return (div.textContent ?? "").trim();
}

function RichQuestionEditor({
    value,
    onChange,
}: {
    value: string;
    onChange: (next: string) => void;
}) {
    const editorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!editorRef.current) return;
        if (editorRef.current.innerText !== value) {
            editorRef.current.innerText = value;
        }
    }, [value]);

    return (
        <div className="panel-grid">
            <div className="row gap-sm">
                <button className="btn btn-ghost" type="button" onClick={() => document.execCommand("bold")}>
                    Bold
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => document.execCommand("italic")}>
                    Italic
                </button>
                <small className="state-text">Konten tetap disimpan sebagai plain text aman.</small>
            </div>
            <div
                ref={editorRef}
                className="rich-editor"
                contentEditable
                suppressContentEditableWarning
                onInput={(event) => onChange(sanitizeToPlainText((event.target as HTMLDivElement).innerHTML))}
            />
        </div>
    );
}

export function QuestionBankPanel() {
    const qc = useQueryClient();
    const toast = useToast();
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [filters, setFilters] = useState<QuestionFilters>({
        search: "",
        topic: "",
        difficulty: "",
        type: "all",
    });
    const [viewMode, setViewMode] = useState<ViewMode>("table");
    const [selected, setSelected] = useState<string[]>([]);
    const [previewQuestion, setPreviewQuestion] = useState<QuestionDto | null>(null);
    const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<CreateQuestionDto>(createEmptyForm());
    const [formError, setFormError] = useState<string | null>(null);
    const [tableError, setTableError] = useState<string | null>(null);
    const [uploadState, setUploadState] = useState<UploadState>("idle");
    const [uploadMessage, setUploadMessage] = useState<string | null>(null);
    const [isImportWizardOpen, setImportWizardOpen] = useState(false);

    const [isAiWidgetOpen, setAiWidgetOpen] = useState(false);
    const [aiGeneratedQuestions, setAiGeneratedQuestions] = useState<AiGeneratedQuestion[] | null>(null);

    const listQuery = useInfiniteQuery({
        queryKey: ["questions", filters],
        initialPageParam: 1,
        queryFn: ({ pageParam }) =>
            questionApi.list({
                page: pageParam,
                page_size: PAGE_SIZE,
                search: filters.search || undefined,
                topic: filters.topic || undefined,
                difficulty: filters.difficulty || undefined,
                type: filters.type === "all" ? undefined : filters.type,
            }),
        getNextPageParam: (lastPage) => {
            const consumed = lastPage.meta.page * lastPage.meta.page_size;
            if (consumed >= lastPage.meta.total) return undefined;
            return lastPage.meta.page + 1;
        },
    });

    const saveMutation = useMutation({
        mutationFn: () => {
            if (editingId) {
                return questionApi.update(editingId, form);
            }
            return questionApi.create(form);
        },
        onMutate: () => {
            setFormError(null);
        },
        onSuccess: async () => {
            setEditingId(null);
            setForm(createEmptyForm());
            setUploadState("idle");
            setUploadMessage(null);
            await qc.invalidateQueries({ queryKey: ["questions"] });
            toast.success(editingId ? "Soal berhasil diupdate." : "Soal berhasil dibuat.");
        },
        onError: (error) => {
            const message = errorMessageForCode(
                error,
                {
                    VALIDATION_ERROR: "Data soal tidak valid. Cek tipe, opsi, dan jawaban.",
                    FORBIDDEN: "Akses ditolak untuk menyimpan soal.",
                },
                "Gagal menyimpan soal.",
            );
            setFormError(message);
            toast.error(message);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (ids.length === 1) {
                await questionApi.remove(ids[0]);
                return;
            }
            await questionApi.bulkDelete({ ids });
        },
        onMutate: () => {
            setTableError(null);
        },
        onSuccess: async () => {
            setSelected([]);
            setConfirmDeleteIds([]);
            await qc.invalidateQueries({ queryKey: ["questions"] });
            toast.success("Soal berhasil dihapus.");
        },
        onError: (error) => {
            const message = errorMessageForCode(
                error,
                {
                    VALIDATION_ERROR: "Pilih minimal satu soal untuk dihapus.",
                    FORBIDDEN: "Akses ditolak untuk menghapus soal.",
                },
                "Gagal menghapus soal.",
            );
            setTableError(message);
            toast.error(message);
        },
    });

    const saveMultipleAiQuestionsMutation = useMutation({
        mutationFn: async (questions: AiGeneratedQuestion[]) => {
            const promises = questions.map(q => {
                const formArgs: CreateQuestionDto = {
                    type: q.question_type as QuestionType,
                    content: q.question_text,
                    answer_key: q.question_type === 'true_false'
                        ? (q.correct_answer_bool ?? false)
                        : String.fromCharCode(65 + (q.options?.findIndex(o => o.is_correct) ?? 0)),
                    options_jsonb: q.question_type === 'multiple_choice' && q.options
                        ? q.options.map((o, idx) => ({ id: String.fromCharCode(65 + idx), label: o.text }))
                        : (q.question_type === 'true_false' ? [{ value: true }, { value: false }] : []),
                    topic: filters.topic || "AI Generated",
                    difficulty: filters.difficulty || "medium",
                };
                return questionApi.create(formArgs);
            });
            await Promise.all(promises);
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["questions"] });
            toast.success("Pertanyaan AI berhasil dimasukkan ke Bank Soal");
            setAiGeneratedQuestions(null);
        },
        onError: (err) => {
            console.error("Failed to insert AI questions", err);
            toast.error("Gagal menyimpan pertanyaan hasil AI ke Bank Soal.");
        }
    });

    const uploadMutation = useMutation({
        mutationFn: (file: File) => questionApi.uploadImage(file),
        onMutate: () => {
            setFormError(null);
            setUploadState("uploading");
            setUploadMessage("Mengunggah gambar...");
        },
        onSuccess: (payload) => {
            setForm((old) => ({ ...old, image_url: payload.image_url }));
            setUploadState("success");
            setUploadMessage("Upload gambar berhasil.");
            toast.success("Upload gambar berhasil.");
        },
        onError: (error) => {
            const message = errorMessageForCode(
                error,
                {
                    VALIDATION_ERROR: "Format/ukuran gambar tidak valid. Gunakan jpg/jpeg/png/webp/gif.",
                    FORBIDDEN: "Akses ditolak untuk upload gambar.",
                },
                "Gagal upload gambar.",
            );
            setUploadState("error");
            setUploadMessage(message);
            setFormError(message);
            toast.error(message);
        },
    });

    const questions = useMemo(() => listQuery.data?.pages.flatMap((page) => page.data) ?? [], [listQuery.data]);
    const listError =
        tableError ??
        (listQuery.isError
            ? errorMessageForCode(
                listQuery.error,
                {
                    FORBIDDEN: "Akses ditolak untuk melihat bank soal.",
                },
                "Gagal mengambil data bank soal.",
            )
            : null);

    useEffect(() => {
        if (!sentinelRef.current || !listQuery.hasNextPage) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const first = entries[0];
                if (!first?.isIntersecting) return;
                if (listQuery.isFetchingNextPage) return;
                void listQuery.fetchNextPage();
            },
            { rootMargin: "120px" },
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [listQuery]);

    const onTypeChanged = (nextType: QuestionType) => {
        if (nextType === "multiple_choice") {
            setForm((f) => ({
                ...f,
                type: nextType,
                options_jsonb: [
                    { id: "A", label: "" },
                    { id: "B", label: "" },
                ],
                answer_key: "A",
            }));
            return;
        }
        if (nextType === "true_false") {
            setForm((f) => ({
                ...f,
                type: nextType,
                options_jsonb: [{ value: true }, { value: false }],
                answer_key: true,
            }));
            return;
        }
        setForm((f) => ({ ...f, type: nextType, options_jsonb: [], answer_key: "" }));
    };

    const updateOption = (index: number, patch: Partial<MultipleChoiceOption>) => {
        const options = normalizeMultipleChoiceOptions(form.options_jsonb);
        const next = [...options];
        next[index] = { ...next[index], ...patch };
        setForm((old) => ({ ...old, options_jsonb: next }));
    };

    const addOption = () => {
        const options = normalizeMultipleChoiceOptions(form.options_jsonb);
        const nextId = `O${options.length + 1}`;
        setForm((old) => ({
            ...old,
            options_jsonb: [...options, { id: nextId, label: "" }],
        }));
    };

    const removeOption = (index: number) => {
        const options = normalizeMultipleChoiceOptions(form.options_jsonb);
        if (options.length <= 2) return;
        const next = options.filter((_, current) => current !== index);
        setForm((old) => ({
            ...old,
            options_jsonb: next,
            answer_key:
                typeof old.answer_key === "string" && next.some((item) => item.id === old.answer_key)
                    ? old.answer_key
                    : next[0]?.id ?? "",
        }));
    };

    const submitForm = () => {
        const validationError = validateQuestionForm(form);
        if (validationError) {
            setFormError(validationError);
            return;
        }
        saveMutation.mutate();
    };

    const startEdit = (question: QuestionDto) => {
        setEditingId(question.id);
        setForm(questionToForm(question));
        setFormError(null);
        setUploadState("idle");
        setUploadMessage(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(createEmptyForm());
        setFormError(null);
        setUploadState("idle");
        setUploadMessage(null);
    };

    const renderAnswerFields = () => {
        if (form.type === "multiple_choice") {
            const options = normalizeMultipleChoiceOptions(form.options_jsonb);
            return (
                <div className="panel-grid">
                    {options.map((opt, index) => (
                        <div key={`${opt.id}-${index}`} className="row gap-sm">
                            <input
                                className="input"
                                style={{ maxWidth: 92 }}
                                value={opt.id}
                                onChange={(event) => updateOption(index, { id: event.target.value })}
                                aria-label={`Option ${index + 1} id`}
                            />
                            <input
                                className="input"
                                value={opt.label}
                                onChange={(event) => updateOption(index, { label: event.target.value })}
                                aria-label={`Option ${index + 1} label`}
                            />
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => removeOption(index)}
                                disabled={options.length <= 2}
                            >
                                Hapus
                            </button>
                        </div>
                    ))}
                    <div className="row gap-sm">
                        <button className="btn btn-ghost" type="button" onClick={addOption}>
                            + Opsi
                        </button>
                    </div>
                    <FormField label="Jawaban benar (id opsi)">
                        <input
                            className="input"
                            value={String(form.answer_key ?? "")}
                            onChange={(event) => setForm((old) => ({ ...old, answer_key: event.target.value }))}
                            aria-label="Correct answer key"
                        />
                    </FormField>
                </div>
            );
        }

        if (form.type === "true_false") {
            return (
                <FormField label="Jawaban benar">
                    <select
                        className="input"
                        value={String(form.answer_key)}
                        onChange={(event) => setForm((old) => ({ ...old, answer_key: event.target.value === "true" }))}
                        aria-label="True false answer"
                    >
                        <option value="true">Benar</option>
                        <option value="false">Salah</option>
                    </select>
                </FormField>
            );
        }

        return (
            <FormField label="Jawaban isian">
                <input
                    className="input"
                    value={String(form.answer_key ?? "")}
                    onChange={(event) => setForm((old) => ({ ...old, answer_key: event.target.value }))}
                    aria-label="Short answer key"
                />
            </FormField>
        );
    };

    return (
        <section className="panel-grid" data-tour="question_bank">
            <CorePageTour
                page="question_bank"
                title="Import dan rapikan Bank Soal"
                description="Question Bank sekarang mendukung wizard import Sprint 12 selain CRUD manual dan bantuan AI."
                bullets={[
                    "Gunakan import wizard untuk preview row valid dan error sebelum commit.",
                    "Bank soal tetap bisa dikelola manual, bulk delete, atau insert dari AI widget.",
                    "Filter sidebar membantu validasi hasil import pada tenant aktif.",
                ]}
            />
            <div className="row gap-sm justify-between">
                <h3 className="section-title">{editingId ? "Edit Soal" : "Tambah Soal"}</h3>
                <div className="row gap-sm">
                    <button className="btn btn-ghost" onClick={() => setImportWizardOpen(true)}>
                        Import Wizard
                    </button>
                <button
                    className="btn btn-primary"
                    onClick={() => setAiWidgetOpen(true)}
                >
                    ✨ AI Generator
                </button>
                </div>
            </div>
            <section className="card">
                <div className="panel-grid">
                    <FormField label="Tipe Soal">
                        <select
                            className="input"
                            value={form.type}
                            onChange={(event) => onTypeChanged(event.target.value as QuestionType)}
                            aria-label="Question type"
                        >
                            {QUESTION_TYPES.map((typeOption) => (
                                <option key={typeOption.value} value={typeOption.value}>
                                    {typeOption.label}
                                </option>
                            ))}
                        </select>
                    </FormField>

                    <FormField label="Konten Soal">
                        <RichQuestionEditor
                            value={form.content}
                            onChange={(next) => setForm((old) => ({ ...old, content: next }))}
                        />
                    </FormField>

                    {renderAnswerFields()}

                    <div className="grid-3">
                        <FormField label="Topic">
                            <input
                                className="input"
                                value={form.topic ?? ""}
                                onChange={(event) => setForm((old) => ({ ...old, topic: event.target.value }))}
                                aria-label="Question topic"
                            />
                        </FormField>
                        <FormField label="Difficulty">
                            <input
                                className="input"
                                value={form.difficulty ?? ""}
                                onChange={(event) => setForm((old) => ({ ...old, difficulty: event.target.value }))}
                                aria-label="Question difficulty"
                            />
                        </FormField>
                        <FormField label="Image">
                            <input
                                className="input"
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) {
                                        uploadMutation.mutate(file);
                                    }
                                }}
                                aria-label="Question image upload"
                            />
                        </FormField>
                    </div>

                    {uploadMessage ? (
                        <p className={`state-text ${uploadState === "error" ? "error" : ""}`}>{uploadMessage}</p>
                    ) : null}
                    {form.image_url ? (
                        <div className="question-image-preview">
                            <img src={form.image_url} alt="Question uploaded" />
                            <small className="state-text">URL: {form.image_url}</small>
                        </div>
                    ) : null}
                    {formError ? <p className="state-text error">{formError}</p> : null}

                    <div className="row gap-sm">
                        <button className="btn" onClick={submitForm} disabled={saveMutation.isPending}>
                            {saveMutation.isPending ? "Menyimpan..." : editingId ? "Update Soal" : "Simpan Soal"}
                        </button>
                        {editingId ? (
                            <button className="btn btn-ghost" onClick={cancelEdit} disabled={saveMutation.isPending}>
                                Cancel Edit
                            </button>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="question-bank-body">
                <aside className="card question-filter-sidebar">
                    <h3 className="section-title">Filter & Aksi Bank Soal</h3>
                    <div className="panel-grid">
                        <input
                            className="input"
                            placeholder="Search konten"
                            value={filters.search}
                            onChange={(event) => setFilters((old) => ({ ...old, search: event.target.value }))}
                            aria-label="Search question content"
                        />
                        <input
                            className="input"
                            placeholder="Filter topic"
                            value={filters.topic}
                            onChange={(event) => setFilters((old) => ({ ...old, topic: event.target.value }))}
                            aria-label="Filter question topic"
                        />
                        <input
                            className="input"
                            placeholder="Filter difficulty"
                            value={filters.difficulty}
                            onChange={(event) => setFilters((old) => ({ ...old, difficulty: event.target.value }))}
                            aria-label="Filter question difficulty"
                        />
                        <select
                            className="input"
                            value={filters.type}
                            onChange={(event) => setFilters((old) => ({ ...old, type: event.target.value as QuestionType | "all" }))}
                            aria-label="Filter question type"
                        >
                            <option value="all">Semua tipe</option>
                            {QUESTION_TYPES.map((typeOption) => (
                                <option key={typeOption.value} value={typeOption.value}>
                                    {typeOption.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="question-filter-actions">
                        <button className="btn" onClick={() => setImportWizardOpen(true)}>
                            Import Soal
                        </button>
                        <button
                            className={`btn ${viewMode === "table" ? "" : "btn-ghost"}`}
                            onClick={() => setViewMode("table")}
                        >
                            Table
                        </button>
                        <button
                            className={`btn ${viewMode === "card" ? "" : "btn-ghost"}`}
                            onClick={() => setViewMode("card")}
                        >
                            Card
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={() => setConfirmDeleteIds(selected)}
                            disabled={selected.length === 0}
                        >
                            Hapus Terpilih ({selected.length})
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={() => {
                                setFilters({
                                    search: "",
                                    topic: "",
                                    difficulty: "",
                                    type: "all",
                                });
                                setSelected([]);
                            }}
                        >
                            Reset Filter
                        </button>
                    </div>
                    <small className="state-text">Selected: {selected.length} soal</small>
                </aside>

                <div className="question-bank-results">
                    {viewMode === "table" ? (
                        <DataTable
                            title="Bank Soal"
                            rows={questions}
                            loading={listQuery.isLoading}
                            error={listError}
                            emptyLabel="Belum ada data soal."
                            selectedIds={selected}
                            onToggleSelect={(id, checked) => {
                                if (checked) {
                                    setSelected((old) => Array.from(new Set([...old, id])));
                                } else {
                                    setSelected((old) => old.filter((item) => item !== id));
                                }
                            }}
                            columns={[
                                { key: "type", header: "Type", render: (q: QuestionDto) => q.type },
                                {
                                    key: "content",
                                    header: "Content",
                                    render: (q: QuestionDto) => <span className="question-content-clamp">{q.content}</span>,
                                },
                                { key: "topic", header: "Topic", render: (q: QuestionDto) => q.topic ?? "-" },
                                { key: "difficulty", header: "Difficulty", render: (q: QuestionDto) => q.difficulty ?? "-" },
                                {
                                    key: "status",
                                    header: "Status",
                                    render: (q: QuestionDto) => <StatusBadge value={q.is_active ? "active" : "inactive"} />,
                                },
                                {
                                    key: "action",
                                    header: "Action",
                                    render: (q: QuestionDto) => (
                                        <div className="row gap-sm">
                                            <button className="btn btn-ghost" onClick={() => setPreviewQuestion(q)}>
                                                Preview
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => startEdit(q)}>
                                                Edit
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => setConfirmDeleteIds([q.id])}>
                                                Delete
                                            </button>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    ) : (
                        <section className="card">
                            <h3 className="section-title">Bank Soal (Card View)</h3>
                            {listError ? <p className="state-text error">{listError}</p> : null}
                            {listQuery.isLoading ? (
                                <div className="question-card-grid">
                                    <LoadingSkeleton card lines={4} />
                                    <LoadingSkeleton card lines={4} />
                                    <LoadingSkeleton card lines={4} />
                                </div>
                            ) : null}
                            {!listQuery.isLoading && questions.length === 0 ? <p className="state-text">Belum ada data soal.</p> : null}
                            <div className="question-card-grid">
                                {questions.map((question) => (
                                    <article key={question.id} className="question-card">
                                        <div className="row gap-sm" style={{ justifyContent: "space-between" }}>
                                            <label className="row gap-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.includes(question.id)}
                                                    onChange={(event) => {
                                                        if (event.target.checked) {
                                                            setSelected((old) => Array.from(new Set([...old, question.id])));
                                                        } else {
                                                            setSelected((old) => old.filter((item) => item !== question.id));
                                                        }
                                                    }}
                                                />
                                                <span className="state-text">{question.type}</span>
                                            </label>
                                            <StatusBadge value={question.is_active ? "active" : "inactive"} />
                                        </div>
                                        <p className="question-content-clamp">{question.content}</p>
                                        <p className="state-text">Topic: {question.topic ?? "-"}</p>
                                        <p className="state-text">Difficulty: {question.difficulty ?? "-"}</p>
                                        <div className="row gap-sm">
                                            <button className="btn btn-ghost" onClick={() => setPreviewQuestion(question)}>
                                                Preview
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => startEdit(question)}>
                                                Edit
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => setConfirmDeleteIds([question.id])}>
                                                Delete
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}
                    <section className="row gap-sm">
                        <button
                            className="btn btn-ghost"
                            onClick={() => listQuery.fetchNextPage()}
                            disabled={!listQuery.hasNextPage || listQuery.isFetchingNextPage}
                        >
                            {listQuery.isFetchingNextPage ? "Loading..." : listQuery.hasNextPage ? "Load More" : "Semua data sudah tampil"}
                        </button>
                    </section>
                    <div ref={sentinelRef} style={{ height: 1 }} />
                </div>
            </section>

            <ConfirmDialog
                open={confirmDeleteIds.length > 0}
                title="Hapus soal?"
                description={`Anda akan menghapus ${confirmDeleteIds.length} soal.`}
                confirmLabel={deleteMutation.isPending ? "Deleting..." : "Hapus"}
                onCancel={() => setConfirmDeleteIds([])}
                onConfirm={() => deleteMutation.mutate(confirmDeleteIds)}
            />

            {previewQuestion ? (
                <div className="dialog-backdrop" role="dialog" aria-modal="true">
                    <div className="dialog-card question-preview-dialog">
                        <h4>Preview Soal</h4>
                        <p><strong>ID:</strong> {previewQuestion.id}</p>
                        <p><strong>Tipe:</strong> {previewQuestion.type}</p>
                        <p><strong>Konten:</strong> {previewQuestion.content}</p>
                        <p><strong>Topic:</strong> {previewQuestion.topic ?? "-"}</p>
                        <p><strong>Difficulty:</strong> {previewQuestion.difficulty ?? "-"}</p>
                        <p><strong>Answer Key:</strong> {JSON.stringify(previewQuestion.answer_key)}</p>
                        <p><strong>Options:</strong> {JSON.stringify(previewQuestion.options_jsonb)}</p>
                        {previewQuestion.image_url ? (
                            <div className="question-image-preview">
                                <img src={previewQuestion.image_url} alt="Question preview" />
                                <small className="state-text">Image URL: {previewQuestion.image_url}</small>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {isAiWidgetOpen && (
                <AiGeneratorWidget
                    onQuestionsGenerated={(questions) => {
                        setAiWidgetOpen(false);
                        setAiGeneratedQuestions(questions);
                    }}
                    onClose={() => setAiWidgetOpen(false)}
                />
            )}

            <QuestionImportWizard
                open={isImportWizardOpen}
                onClose={() => setImportWizardOpen(false)}
                onImported={async () => {
                    await qc.invalidateQueries({ queryKey: ["questions"] });
                }}
            />

            {aiGeneratedQuestions && (
                <AiReviewPanel
                    questions={aiGeneratedQuestions}
                    onInsert={(selected) => saveMultipleAiQuestionsMutation.mutate(selected)}
                    onCancel={() => setAiGeneratedQuestions(null)}
                />
            )}
        </section>
    );
}
