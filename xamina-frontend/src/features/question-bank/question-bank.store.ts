import { create } from "zustand";
import type { QuestionV2Dto, QuestionStatus, MediaAttachment } from "./question-bank.api";
import type { QuestionType, CreateQuestionDto } from "@/types/api.types";

/* ── Types ── */
export interface QuestionFilters {
    search: string;
    topic: string;
    difficulty: string;
    type: QuestionType | "all";
    status: QuestionStatus | "all";
}

export type EditorMode = "idle" | "create" | "edit";

/* ── Store ── */
interface QuestionBankState {
    /* Selection */
    selectedIds: string[];
    activeQuestionId: string | null;

    /* Filters */
    filters: QuestionFilters;

    /* Editor */
    editorMode: EditorMode;
    editorForm: CreateQuestionDto & { tags?: string[]; media_urls?: MediaAttachment[]; status?: QuestionStatus };
    editorDirty: boolean;
    lastSavedAt: number | null;

    /* AI */
    aiPrompt: string;
    aiLoading: boolean;

    /* Dropzone */
    isDraggingOver: boolean;
    uploadProgress: number | null;

    /* List pane width */
    listPaneWidth: number;

    /* Actions */
    setActiveQuestion: (id: string | null) => void;
    toggleSelected: (id: string) => void;
    selectAll: (ids: string[]) => void;
    clearSelection: () => void;
    setFilters: (patch: Partial<QuestionFilters>) => void;
    resetFilters: () => void;

    setEditorMode: (mode: EditorMode) => void;
    setEditorForm: (patch: Partial<QuestionBankState["editorForm"]>) => void;
    startCreate: () => void;
    resetEditor: () => void;
    markSaved: () => void;
    setEditorDirty: (dirty: boolean) => void;

    setAiPrompt: (prompt: string) => void;
    setAiLoading: (loading: boolean) => void;

    setDraggingOver: (dragging: boolean) => void;
    setUploadProgress: (progress: number | null) => void;

    setListPaneWidth: (width: number) => void;

    loadQuestionIntoEditor: (question: QuestionV2Dto) => void;
}

function createEmptyForm(): QuestionBankState["editorForm"] {
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
        tags: [],
        media_urls: [],
        status: "published",
    };
}

const defaultFilters: QuestionFilters = {
    search: "",
    topic: "",
    difficulty: "",
    type: "all",
    status: "all",
};

export const useQuestionBankStore = create<QuestionBankState>()((set) => ({
    selectedIds: [],
    activeQuestionId: null,
    filters: { ...defaultFilters },
    editorMode: "idle",
    editorForm: createEmptyForm(),
    editorDirty: false,
    lastSavedAt: null,
    aiPrompt: "",
    aiLoading: false,
    isDraggingOver: false,
    uploadProgress: null,
    listPaneWidth: 380,

    setActiveQuestion: (id) => set({ activeQuestionId: id }),
    toggleSelected: (id) =>
        set((s) => ({
            selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((i) => i !== id) : [...s.selectedIds, id],
        })),
    selectAll: (ids) => set({ selectedIds: ids }),
    clearSelection: () => set({ selectedIds: [] }),
    setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
    resetFilters: () => set({ filters: { ...defaultFilters } }),

    setEditorMode: (mode) => set({ editorMode: mode }),
    setEditorForm: (patch) =>
        set((s) => ({
            editorForm: { ...s.editorForm, ...patch },
            editorDirty: true,
        })),
    startCreate: () => set({ editorForm: createEmptyForm(), editorMode: "create", editorDirty: false, lastSavedAt: null, activeQuestionId: null }),
    resetEditor: () => set({ editorForm: createEmptyForm(), editorMode: "idle", editorDirty: false, lastSavedAt: null, activeQuestionId: null }),
    markSaved: () => set({ editorDirty: false, lastSavedAt: Date.now() }),
    setEditorDirty: (dirty) => set({ editorDirty: dirty }),

    setAiPrompt: (prompt) => set({ aiPrompt: prompt }),
    setAiLoading: (loading) => set({ aiLoading: loading }),

    setDraggingOver: (dragging) => set({ isDraggingOver: dragging }),
    setUploadProgress: (progress) => set({ uploadProgress: progress }),

    setListPaneWidth: (width) => set({ listPaneWidth: Math.max(280, Math.min(520, width)) }),

    loadQuestionIntoEditor: (question) => {
        const form: QuestionBankState["editorForm"] = {
            type: question.type,
            content: question.content,
            options_jsonb: question.options_jsonb,
            answer_key: question.answer_key,
            topic: question.topic ?? "",
            difficulty: question.difficulty ?? "",
            image_url: question.image_url ?? undefined,
            tags: question.tags ?? [],
            media_urls: question.media_urls ?? [],
            status: question.status ?? "published",
        };
        set({
            editorMode: "edit",
            editorForm: form,
            activeQuestionId: question.id,
            editorDirty: false,
            lastSavedAt: null,
        });
    },
}));
