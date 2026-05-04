import { Trash2, X } from "lucide-react";

interface Props { count: number; onDelete: () => void; onClear: () => void; }

export function BulkActionsToolbar({ count, onDelete, onClear }: Props) {
    return (
        <div
            className="flex items-center gap-3 px-4 py-3 mx-2.5 mb-2.5 rounded-xl border"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
            <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--text-1)" }}>
                {count} soal terpilih
            </span>
            <div className="flex items-center gap-1.5">
                <button
                    onClick={onDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200"
                    style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; }}
                >
                    <Trash2 size={12} /> Hapus
                </button>
                <button
                    onClick={onClear}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200"
                    style={{ color: "var(--text-2)", borderColor: "var(--border)", background: "transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--card)"; e.currentTarget.style.color = "var(--text-0)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}
                >
                    <X size={12} /> Batal
                </button>
            </div>
        </div>
    );
}
