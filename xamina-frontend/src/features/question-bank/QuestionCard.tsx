import type { QuestionV2Dto } from "./question-bank.api.ts";
import { Paperclip } from "lucide-react";

interface Props {
    question: QuestionV2Dto;
    isActive: boolean;
    isSelected: boolean;
    onClick: () => void;
    onToggleSelect: () => void;
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
    multiple_choice: { label: "PG", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    true_false: { label: "B/S", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    short_answer: { label: "ISIAN", cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
};

const STATUS_DOT: Record<string, string> = {
    draft: "bg-amber-400",
    review: "bg-violet-400",
    published: "bg-emerald-400",
    archived: "bg-slate-500",
};

const DIFF_CLS: Record<string, string> = {
    easy: "text-emerald-500/70",
    medium: "text-amber-500/70",
    hard: "text-rose-500/70",
};

export function QuestionCard({ question, isActive, isSelected, onClick, onToggleSelect }: Props) {
    const typeInfo = TYPE_META[question.type] ?? { label: question.type, cls: "text-[color:var(--text-2)] border-[color:var(--border)]" };
    const status = question.status ?? "published";
    const diff = question.difficulty ?? "medium";

    return (
        <div
            onClick={onClick}
            id={`qb-card-${question.id}`}
            className={[
                "group relative flex gap-3 items-start px-3.5 py-3 rounded-xl border cursor-pointer select-none",
                "transition-all duration-200 ease-out",
            ].join(" ")}
            style={
                isActive
                    ? {
                        background: "color-mix(in srgb, var(--primary) 8%, var(--card))",
                        borderColor: "color-mix(in srgb, var(--primary) 45%, transparent)",
                        boxShadow: "0 4px 20px color-mix(in srgb, var(--primary) 12%, transparent)",
                    }
                    : isSelected
                    ? {
                        background: "color-mix(in srgb, var(--primary) 5%, var(--card))",
                        borderColor: "color-mix(in srgb, var(--primary) 30%, transparent)",
                    }
                    : {
                        background: "var(--card)",
                        borderColor: "var(--border)",
                    }
            }
        >
            {/* Active accent line */}
            {isActive && (
                <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full" style={{ background: "var(--primary)" }} />
            )}

            {/* Checkbox */}
            <div
                className="flex-shrink-0 mt-0.5"
                onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            >
                <div className={[
                    "w-4 h-4 rounded flex items-center justify-center border transition-all duration-150 cursor-pointer",
                    isSelected
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]"
                        : "border-[color:var(--border)] bg-transparent hover:border-[color:var(--primary-border)]",
                ].join(" ")}>
                    {isSelected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 3.5L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium leading-snug mb-2 line-clamp-2" style={{ color: "var(--text-0)" }}>
                    {question.content || (
                        <span style={{ color: "var(--text-3)", fontStyle: "italic", fontWeight: 400 }}>
                            Konten soal kosong...
                        </span>
                    )}
                </p>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Status dot */}
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? "bg-slate-500"}`} title={`Status: ${status}`} />

                    {/* Type badge */}
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider uppercase border ${typeInfo.cls}`}>
                        {typeInfo.label}
                    </span>

                    {/* Topic */}
                    {question.topic && (
                        <span
                            className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium max-w-[110px] truncate border"
                            style={{ background: "var(--surface-2)", color: "var(--text-2)", borderColor: "var(--border)" }}
                        >
                            {question.topic}
                        </span>
                    )}

                    {/* Difficulty */}
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${DIFF_CLS[diff] ?? "opacity-50"}`}>
                        {diff}
                    </span>

                    {/* Media icon */}
                    {(question.media_urls?.length ?? 0) > 0 && (
                        <span className="ml-auto flex items-center" style={{ color: "var(--text-3)" }} title={`${question.media_urls?.length} Lampiran`}>
                            <Paperclip size={11} strokeWidth={2} />
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}