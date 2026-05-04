import { useEffect, useRef, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { QuestionV2Dto } from "./question-bank.api.ts";
import { useQuestionBankStore } from "./question-bank.store.ts";
import { QuestionCard } from "./QuestionCard.tsx";
import { useQueryClient } from "@tanstack/react-query";
import { questionBankApi } from "./question-bank.api.ts";
import { useToast } from "@/store/toast.store";
import { BulkActionsToolbar } from "./BulkActionsToolbar.tsx";
import { Search, Download, Upload, Plus, FileText, Zap, Library } from "lucide-react";

interface Props {
    questions: QuestionV2Dto[];
    totalCount: number;
    isLoading: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    onFetchNextPage: () => void;
    onQuestionClick: (q: QuestionV2Dto) => void;
    onDelete: (ids: string[]) => void;
    onNewQuestion: () => void;
    style?: CSSProperties;
}

const smoothEase = [0.22, 1, 0.36, 1] as const;
const listContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const listItem = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: smoothEase } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
};

const TYPE_FILTERS = [
    { key: "all", label: "Semua" },
    { key: "multiple_choice", label: "PG" },
    { key: "true_false", label: "B/S" },
    { key: "short_answer", label: "Isian" },
] as const;

export function QuestionListPane({
    questions, totalCount, isLoading, hasNextPage,
    isFetchingNextPage, onFetchNextPage, onQuestionClick, onDelete, onNewQuestion, style,
}: Props) {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const filters = useQuestionBankStore((s) => s.filters);
    const setFilters = useQuestionBankStore((s) => s.setFilters);
    const selectedIds = useQuestionBankStore((s) => s.selectedIds);
    const activeQuestionId = useQuestionBankStore((s) => s.activeQuestionId);
    const toggleSelected = useQuestionBankStore((s) => s.toggleSelected);
    const toast = useToast();
    const qc = useQueryClient();

    const handleDownloadTemplate = async () => {
        try {
            const blob = await questionBankApi.downloadImportTemplate("xlsx");
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "Template_Soal_Xamina.xlsx";
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); window.URL.revokeObjectURL(url);
        } catch { toast.error("Gagal mengunduh template soal."); }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            toast.info("Memproses file import...");
            const preview = await questionBankApi.previewImport(file);
            if (preview.questions.length === 0) { toast.error("Tidak ada soal valid ditemukan."); return; }
            if (window.confirm(`Ditemukan ${preview.questions.length} soal. Lanjutkan import?`)) {
                await questionBankApi.commitImport(preview.questions);
                toast.success(`${preview.questions.length} soal berhasil diimport.`);
                qc.invalidateQueries({ queryKey: ["questions-v2"] });
            }
        } catch { toast.error("Gagal memproses file import."); }
        finally { e.target.value = ""; }
    };

    useEffect(() => {
        if (!sentinelRef.current || !hasNextPage) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0]?.isIntersecting && !isFetchingNextPage) onFetchNextPage(); },
            { rootMargin: "120px" },
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, onFetchNextPage]);

    const reviewQuestions = questions.filter((q) => (q.status ?? "published") === "review");
    const otherQuestions = questions.filter((q) => (q.status ?? "published") !== "review");

    const iconBtnCls = "w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 cursor-pointer";

    return (
        <div
            className="flex flex-col flex-shrink-0 overflow-hidden rounded-2xl border"
            style={{
                background: "color-mix(in srgb, var(--card) 72%, transparent)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)",
                ...style,
            }}
        >
            {/* Header */}
            <div className="flex flex-col gap-2.5 px-3.5 pt-3.5 pb-3 flex-shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
                {/* Search */}
                <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-3)" }} />
                    <input
                        id="qb-search-input"
                        placeholder="Cari soal..."
                        value={filters.search}
                        onChange={(e) => setFilters({ search: e.target.value })}
                        className="w-full rounded-xl text-[13px] pl-9 pr-4 h-9 outline-none border transition-all duration-200"
                        style={{
                            background: "var(--surface-2)",
                            borderColor: "var(--border)",
                            color: "var(--text-0)",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary-border)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-bg)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                </div>

                {/* Filters */}
                <div className="flex gap-1.5 flex-wrap">
                    {TYPE_FILTERS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setFilters({ type: key })}
                            className="px-3 py-1 rounded-lg text-xs font-semibold border transition-all duration-200"
                            style={
                                filters.type === key
                                    ? { background: "var(--primary-bg)", borderColor: "var(--primary-border)", color: "var(--primary)" }
                                    : { background: "transparent", borderColor: "var(--border)", color: "var(--text-2)" }
                            }
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Count + Actions */}
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--text-3)" }}>
                        {totalCount} soal
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleDownloadTemplate}
                            title="Download Template"
                            className={iconBtnCls}
                            style={{ color: "var(--text-2)", borderColor: "var(--border)", background: "transparent" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-0)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}
                        >
                            <Download size={13} />
                        </button>
                        <button
                            onClick={() => document.getElementById("qb-import-input")?.click()}
                            title="Import Excel"
                            className={iconBtnCls}
                            style={{ color: "var(--text-2)", borderColor: "var(--border)", background: "transparent" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-0)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}
                        >
                            <Upload size={13} />
                        </button>
                        <input id="qb-import-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
                        <button
                            onClick={onNewQuestion}
                            id="qb-new-question-btn"
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold border transition-all duration-200"
                            style={{
                                background: "var(--primary)",
                                borderColor: "var(--primary-border)",
                                color: "#fff",
                                boxShadow: "0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent)",
                            }}
                        >
                            <Plus size={13} strokeWidth={2.5} /> Baru
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 qb-scroll">
                {isLoading ? (
                    <div className="flex items-center justify-center py-14">
                        <div className="w-6 h-6 rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--primary)] animate-spin" />
                    </div>
                ) : questions.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-14 gap-3"
                    >
                        <FileText size={40} strokeWidth={1} style={{ color: "var(--border)" }} />
                        <span className="text-[13px] font-medium" style={{ color: "var(--text-3)" }}>Belum ada soal.</span>
                    </motion.div>
                ) : (
                    <motion.div variants={listContainer} initial="hidden" animate="visible">
                        <AnimatePresence mode="popLayout">
                            {reviewQuestions.length > 0 && (
                                <motion.div layout key="review-header" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex items-center gap-1.5 px-1 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                                    style={{ color: "var(--text-3)" }}
                                >
                                    <Zap size={10} className="text-amber-500" /> Review ({reviewQuestions.length})
                                </motion.div>
                            )}
                            {reviewQuestions.map((q) => (
                                <motion.div layout variants={listItem} initial="hidden" animate="visible" exit="exit" key={q.id} className="mb-1.5">
                                    <QuestionCard question={q} isActive={activeQuestionId === q.id} isSelected={selectedIds.includes(q.id)} onClick={() => onQuestionClick(q)} onToggleSelect={() => toggleSelected(q.id)} />
                                </motion.div>
                            ))}
                            {otherQuestions.length > 0 && (
                                <motion.div layout key="bank-header" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex items-center gap-1.5 px-1 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                                    style={{ color: "var(--text-3)" }}
                                >
                                    <Library size={10} className="text-blue-400" /> Bank Soal ({otherQuestions.length})
                                </motion.div>
                            )}
                            {otherQuestions.map((q) => (
                                <motion.div layout variants={listItem} initial="hidden" animate="visible" exit="exit" key={q.id} className="mb-1.5">
                                    <QuestionCard question={q} isActive={activeQuestionId === q.id} isSelected={selectedIds.includes(q.id)} onClick={() => onQuestionClick(q)} onToggleSelect={() => toggleSelected(q.id)} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {hasNextPage && <div ref={sentinelRef} style={{ height: 1 }} />}
                        {isFetchingNextPage && (
                            <div className="flex justify-center py-3">
                                <div className="w-5 h-5 rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--primary)] animate-spin" />
                            </div>
                        )}
                    </motion.div>
                )}
            </div>

            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.3, ease: smoothEase }} className="flex-shrink-0"
                    >
                        <BulkActionsToolbar count={selectedIds.length} onDelete={() => onDelete(selectedIds)} onClear={() => useQuestionBankStore.getState().clearSelection()} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}