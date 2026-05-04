import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuestionBankStore } from "./question-bank.store.ts";
import { questionBankApi } from "./question-bank.api.ts";
import { useToast } from "@/store/toast.store.ts";
import type { QuestionType } from "@/types/api.types.ts";
import { Sparkles, Loader2, Wand2, RefreshCw } from "lucide-react";

interface Props { onRefresh: () => void; }

export function AIPromptBar({ onRefresh }: Props) {
    const toast = useToast();
    const qc = useQueryClient();
    const aiPrompt = useQuestionBankStore((s) => s.aiPrompt);
    const setAiPrompt = useQuestionBankStore((s) => s.setAiPrompt);
    const aiLoading = useQuestionBankStore((s) => s.aiLoading);
    const setAiLoading = useQuestionBankStore((s) => s.setAiLoading);

    const generateMutation = useMutation({
        mutationFn: async () => {
            const { api } = await import("@/lib/axios");
            const response = await api.post("/ai/generate", { prompt: aiPrompt, count: 3, topic: aiPrompt, question_type: "multiple_choice", difficulty: "medium" });
            return response.data?.data?.questions ?? [];
        },
        onMutate: () => setAiLoading(true),
        onSuccess: async (questions: any[]) => {
            setAiLoading(false);
            if (questions.length === 0) { toast.info("AI tidak menghasilkan soal. Coba prompt lebih spesifik."); return; }
            for (const q of questions) {
                try {
                    const payload: any = { type: (q.question_type ?? "multiple_choice") as QuestionType, content: q.question_text ?? q.content ?? "", options_jsonb: q.options?.map((o: any, i: number) => ({ id: String.fromCharCode(65 + i), label: o.text ?? o.label ?? "" })) ?? [], answer_key: q.correct_answer ?? "A", topic: q.topic ?? "AI Generated", difficulty: q.difficulty ?? "medium", status: "review" };
                    await questionBankApi.create(payload);
                } catch { /* skip */ }
            }
            toast.success(`${questions.length} soal AI berhasil ditambahkan.`);
            setAiPrompt("");
            qc.invalidateQueries({ queryKey: ["questions-v2"] });
        },
        onError: () => { setAiLoading(false); toast.error("Gagal generate soal AI."); },
    });

    return (
        <div
            className="flex items-center gap-3 px-5 py-2 rounded-2xl w-full max-w-3xl mx-auto border transition-all duration-300"
            style={{
                background: "color-mix(in srgb, var(--card) 72%, transparent)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
                boxShadow: "0 2px 20px rgba(0,0,0,0.06), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)",
            }}
        >
            <Sparkles size={15} className="flex-shrink-0 pointer-events-none text-amber-500" />
            <input
                id="qb-ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Buatkan soal... (contoh: 3 soal HOTS tentang fotosintesis)"
                onKeyDown={(e) => { if (e.key === "Enter" && aiPrompt.trim() && !aiLoading) generateMutation.mutate(); }}
                className="flex-1 bg-transparent border-none outline-none text-[13px] h-10"
                style={{ color: "var(--text-0)" }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    disabled={!aiPrompt.trim() || aiLoading}
                    onClick={() => generateMutation.mutate()}
                    id="qb-ai-generate-btn"
                    className="flex items-center gap-2 px-4 h-8 rounded-xl text-xs font-semibold border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                        background: "var(--primary)",
                        borderColor: "var(--primary-border)",
                        color: "#fff",
                        boxShadow: "0 2px 8px color-mix(in srgb, var(--primary) 28%, transparent)",
                    }}
                >
                    {aiLoading
                        ? <><Loader2 size={13} className="animate-spin" /> Generating...</>
                        : <><Wand2 size={13} /> Generate</>
                    }
                </button>
                <button
                    onClick={onRefresh}
                    title="Refresh list"
                    className="w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-200"
                    style={{ color: "var(--text-3)", borderColor: "var(--border)", background: "transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-0)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}
                >
                    <RefreshCw size={13} />
                </button>
            </div>
        </div>
    );
}
