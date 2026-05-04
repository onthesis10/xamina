import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import { questionBankApi, type QuestionV2Dto } from "./question-bank.api.ts";
import { useQuestionBankStore } from "./question-bank.store.ts";
import { QuestionListPane } from "./QuestionListPane.tsx";
import { QuestionEditorPane } from "./QuestionEditorPane.tsx";
import { AIPromptBar } from "./AIPromptBar.tsx";
import { UniversalDropzone } from "./UniversalDropzone.tsx";
import { motion } from "framer-motion";
import "./question-bank.css";

const PAGE_SIZE = 30;

// --- Easing Khas Premium / macOS ---
const smoothEase = [0.22, 1, 0.36, 1];

const layoutVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15,
            delayChildren: 0.1,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.8, ease: smoothEase }
    },
};

export function QuestionBankLayout() {
    const qc = useQueryClient();
    const toast = useToast();
    const dividerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDraggingDivider, setDraggingDivider] = useState(false);

    const filters = useQuestionBankStore((s) => s.filters);
    const listPaneWidth = useQuestionBankStore((s) => s.listPaneWidth);
    const setListPaneWidth = useQuestionBankStore((s) => s.setListPaneWidth);

    /* --- Data Fetching --- */
    const listQuery = useInfiniteQuery({
        queryKey: ["questions-v2", filters],
        initialPageParam: 1,
        queryFn: ({ pageParam }) =>
            questionBankApi.list({
                page: pageParam,
                page_size: PAGE_SIZE,
                search: filters.search || undefined,
                topic: filters.topic || undefined,
                difficulty: filters.difficulty || undefined,
                type: filters.type === "all" ? undefined : filters.type,
            }),
        getNextPageParam: (lastPage) => {
            const consumed = lastPage.meta.page * lastPage.meta.page_size;
            return consumed >= lastPage.meta.total ? undefined : lastPage.meta.page + 1;
        },
    });

    const questions: QuestionV2Dto[] = listQuery.data?.pages.flatMap((p) => p.data) ?? [];
    const totalCount = listQuery.data?.pages[0]?.meta.total ?? 0;

    /* --- Mutations --- */
    const saveMutation = useMutation({
        mutationFn: async () => {
            const store = useQuestionBankStore.getState();
            if (store.editorMode === "edit" && store.activeQuestionId) {
                return questionBankApi.update(store.activeQuestionId, store.editorForm);
            }
            return questionBankApi.create(store.editorForm);
        },
        onSuccess: () => {
            const store = useQuestionBankStore.getState();
            toast.success(store.editorMode === "edit" ? "Soal berhasil diupdate." : "Soal berhasil dibuat.");
            store.markSaved();
            if (store.editorMode === "create") store.resetEditor();
            qc.invalidateQueries({ queryKey: ["questions-v2"] });
        },
        onError: (error) => {
            toast.error(errorMessageForCode(error, { VALIDATION_ERROR: "Data soal tidak valid." }, "Gagal menyimpan soal."));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (ids.length === 1) return questionBankApi.remove(ids[0]);
            return questionBankApi.bulkDelete(ids);
        },
        onSuccess: () => {
            useQuestionBankStore.getState().clearSelection();
            toast.success("Soal berhasil dihapus.");
            qc.invalidateQueries({ queryKey: ["questions-v2"] });
        },
        onError: (error) => {
            toast.error(errorMessageForCode(error, {}, "Gagal menghapus soal."));
        },
    });

    /* --- Divider Drag Resize --- */
    const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setDraggingDivider(true);
    }, []);

    useEffect(() => {
        if (!isDraggingDivider) return;

        const onMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();

            // Batas minimal & maksimal agar layout tetap proporsional & rapi
            const minWidth = 350;
            const maxWidth = rect.width - 450;

            let x = e.clientX - rect.left;
            if (x < minWidth) x = minWidth;
            if (x > maxWidth) x = maxWidth;

            setListPaneWidth(x);
        };

        const onUp = () => setDraggingDivider(false);

        document.body.classList.add("is-resizing");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);

        return () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.classList.remove("is-resizing");
        };
    }, [isDraggingDivider, setListPaneWidth]);

    /* --- Handlers --- */
    const onQuestionClick = useCallback(
        (q: QuestionV2Dto) => {
            useQuestionBankStore.getState().loadQuestionIntoEditor(q);
        },
        [],
    );

    const onSave = useCallback(() => saveMutation.mutate(), [saveMutation]);

    const onDelete = useCallback(
        (ids: string[]) => {
            if (ids.length === 0) return;
            if (!window.confirm(`Hapus ${ids.length} soal?`)) return;
            deleteMutation.mutate(ids);
        },
        [deleteMutation],
    );

    const onNewQuestion = useCallback(() => {
        useQuestionBankStore.getState().startCreate();
    }, []);

    return (
        <motion.div
            ref={containerRef}
            initial="hidden"
            animate="visible"
            variants={layoutVariants}
            className="relative flex flex-col h-[calc(100vh-60px)] overflow-hidden gap-4 p-5"
            style={{ background: "transparent" }}
        >
            <div className="flex flex-col flex-1 gap-4 min-h-0">
                <motion.div variants={itemVariants}>
                    <AIPromptBar onRefresh={() => qc.invalidateQueries({ queryKey: ["questions-v2"] })} />
                </motion.div>

                <motion.div className="flex flex-1 min-h-0 overflow-hidden gap-4" variants={itemVariants}>
                    <QuestionListPane
                        questions={questions}
                        totalCount={totalCount}
                        isLoading={listQuery.isLoading}
                        hasNextPage={!!listQuery.hasNextPage}
                        isFetchingNextPage={listQuery.isFetchingNextPage}
                        onFetchNextPage={() => listQuery.fetchNextPage()}
                        onQuestionClick={onQuestionClick}
                        onDelete={onDelete}
                        onNewQuestion={onNewQuestion}
                        style={{ width: listPaneWidth, minWidth: 340, maxWidth: 500 }}
                    />

                    {/* Drag divider */}
                    <div
                        ref={dividerRef}
                        onMouseDown={onDividerMouseDown}
                        className={`relative w-1.5 flex-shrink-0 cursor-col-resize z-10 group flex items-center justify-center ${isDraggingDivider ? "is-dragging" : ""}`}
                    >
                        <div
                            className="w-0.5 rounded-full transition-all duration-200"
                            style={{
                                height: isDraggingDivider ? 48 : 32,
                                width: isDraggingDivider ? 3 : 2,
                                background: isDraggingDivider ? "var(--primary)" : "var(--border)",
                            }}
                        />
                    </div>

                    <QuestionEditorPane
                        onSave={onSave}
                        isSaving={saveMutation.isPending}
                        onDelete={onDelete}
                    />
                </motion.div>
            </div>
            <UniversalDropzone />
        </motion.div>
    );
}