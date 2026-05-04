import { useCallback, useEffect, useRef, useState } from "react";
import type { QuestionType } from "@/types/api.types";
import { useQuestionBankStore } from "./question-bank.store.ts";
import { MediaPreview } from "./MediaPreview.tsx";
import type { MediaAttachment } from "./question-bank.api.ts";
import { questionBankApi } from "./question-bank.api.ts";
import { useToast } from "@/store/toast.store";
import { PenTool, Trash2, X, CheckCircle2, XCircle, Paperclip, ChevronDown, Plus, Save, RotateCcw } from "lucide-react";

interface Props { onSave: () => void; isSaving: boolean; onDelete: (ids: string[]) => void; }

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
    { value: "multiple_choice", label: "Pilihan Ganda" },
    { value: "true_false", label: "Benar / Salah" },
    { value: "short_answer", label: "Isian Singkat" },
];

interface MCOption { id: string; label: string; }
function normalizeMCOptions(options: unknown): MCOption[] {
    if (!Array.isArray(options)) return [{ id: "A", label: "" }, { id: "B", label: "" }];
    const out = options.filter((o): o is MCOption => !!o && typeof o === "object" && typeof (o as MCOption).id === "string").map((o) => ({ id: o.id, label: o.label ?? "" }));
    return out.length >= 2 ? out : [{ id: "A", label: "" }, { id: "B", label: "" }];
}

function Label({ children }: { children: React.ReactNode }) {
    return <label className="block mb-2 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-2)" }}>{children}</label>;
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={`w-full rounded-xl text-[13px] px-4 h-10 outline-none border transition-all duration-200 ${props.className ?? ""}`}
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-0)", ...props.style }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary-border)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-bg)"; props.onFocus?.(e); }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; props.onBlur?.(e); }}
        />
    );
}

function CustomSelect({ value, options, onChange, placeholder }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; placeholder: string; }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
    const selected = options.find((o) => o.value === value);
    return (
        <div ref={ref} className="relative w-full">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between rounded-xl text-[13px] px-4 h-10 outline-none border transition-all duration-200 cursor-pointer"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: selected ? "var(--text-0)" : "var(--text-3)" }}
            >
                <span>{selected ? selected.label : placeholder}</span>
                <ChevronDown size={13} style={{ color: "var(--text-3)", transition: "transform 0.25s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>
            {open && (
                <div className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-xl border overflow-hidden shadow-lg"
                    style={{ background: "var(--card)", borderColor: "var(--border)", boxShadow: "0 16px 40px rgba(0,0,0,0.15)" }}
                >
                    {options.map((opt) => (
                        <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
                            className="px-4 py-2.5 text-[13px] cursor-pointer transition-colors duration-150"
                            style={value === opt.value
                                ? { background: "var(--primary-bg)", color: "var(--primary)", fontWeight: 600 }
                                : { color: "var(--text-1)" }
                            }
                            onMouseEnter={(e) => { if (value !== opt.value) e.currentTarget.style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { if (value !== opt.value) e.currentTarget.style.background = "transparent"; }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function QuestionEditorPane({ onSave, isSaving, onDelete }: Props) {
    const toast = useToast();
    const editorMode = useQuestionBankStore((s) => s.editorMode);
    const form = useQuestionBankStore((s) => s.editorForm);
    const activeId = useQuestionBankStore((s) => s.activeQuestionId);
    const editorDirty = useQuestionBankStore((s) => s.editorDirty);
    const lastSavedAt = useQuestionBankStore((s) => s.lastSavedAt);
    const setForm = useQuestionBankStore((s) => s.setEditorForm);
    const resetEditor = useQuestionBankStore((s) => s.resetEditor);
    const uploadProgress = useQuestionBankStore((s) => s.uploadProgress);
    const setUploadProgress = useQuestionBankStore((s) => s.setUploadProgress);

    const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => {
        if (!editorDirty || editorMode !== "edit" || !activeId) return;
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => { onSave(); }, 2500);
        return () => clearTimeout(autoSaveTimer.current);
    }, [editorDirty, form, editorMode, activeId, onSave]);

    const handleFileUpload = useCallback(async (files: FileList | File[]) => {
        for (const file of Array.from(files)) {
            if (file.size > 10 * 1024 * 1024) { toast.error(`File ${file.name} terlalu besar (max 10MB).`); continue; }
            try {
                setUploadProgress(0);
                const p = await questionBankApi.requestPresign({ file_name: file.name, content_type: file.type, file_size: file.size });
                await questionBankApi.uploadToPresignedUrl(p.upload_url, file, (pct) => setUploadProgress(pct));
                const c = await questionBankApi.confirmUpload({ object_key: p.object_key, question_id: activeId ?? undefined });
                const media: MediaAttachment = { url: c.public_url, media_type: file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image", file_name: file.name, file_size: file.size };
                setForm({ media_urls: [...(form.media_urls ?? []), media] });
                setUploadProgress(100);
                setTimeout(() => setUploadProgress(null), 1500);
                toast.success(`${file.name} berhasil diunggah.`);
            } catch { setUploadProgress(null); toast.error(`Gagal mengunggah ${file.name}.`); }
        }
    }, [form.media_urls, setForm, setUploadProgress, toast, activeId]);

    const onTypeChange = (t: QuestionType) => {
        if (t === "multiple_choice") setForm({ type: t, options_jsonb: [{ id: "A", label: "" }, { id: "B", label: "" }], answer_key: "A" });
        else if (t === "true_false") setForm({ type: t, options_jsonb: [{ value: true }, { value: false }], answer_key: true });
        else setForm({ type: t, options_jsonb: [], answer_key: "" });
    };

    const mcOptions = normalizeMCOptions(form.options_jsonb);
    const updateOption = (idx: number, patch: Partial<MCOption>) => { const n = [...mcOptions]; n[idx] = { ...n[idx], ...patch }; setForm({ options_jsonb: n }); };
    const addOption = () => { setForm({ options_jsonb: [...mcOptions, { id: String.fromCharCode(65 + mcOptions.length), label: "" }] }); };
    const removeOption = (idx: number) => { if (mcOptions.length <= 2) return; setForm({ options_jsonb: mcOptions.filter((_, i) => i !== idx) }); };
    const removeMedia = (idx: number) => { const n = [...(form.media_urls ?? [])]; n.splice(idx, 1); setForm({ media_urls: n }); };

    const savedAgo = lastSavedAt ? Math.round((Date.now() - lastSavedAt) / 1000) : null;

    const panelStyle: React.CSSProperties = {
        background: "var(--card)",
        borderColor: "var(--border)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    };

    if (editorMode === "idle") {
        return (
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-2xl border" style={panelStyle}>
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-12">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                        <PenTool size={24} strokeWidth={1.25} style={{ color: "var(--text-3)" }} />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-semibold mb-1" style={{ color: "var(--text-0)" }}>Pilih soal atau buat baru</h3>
                        <p className="text-[13px] leading-relaxed max-w-[200px] mx-auto" style={{ color: "var(--text-3)" }}>
                            Klik soal di panel kiri, atau tekan <strong style={{ color: "var(--text-2)", fontWeight: 600 }}>+ Baru</strong>.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-2xl border" style={panelStyle}>
            <div className="flex-1 overflow-y-auto qb-scroll px-7 py-6">

                {/* Header */}
                <div className="flex items-start justify-between mb-6 pb-5 border-b" style={{ borderColor: "var(--border)" }}>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-0)" }}>
                            {editorMode === "edit" ? "Edit Soal" : "Soal Baru"}
                        </h2>
                        {editorDirty && <p className="text-[11px] mt-0.5 font-medium" style={{ color: "var(--primary)" }}>Belum tersimpan</p>}
                        {savedAgo !== null && savedAgo < 30 && !editorDirty && <p className="text-[11px] mt-0.5 text-emerald-500">Tersimpan {savedAgo}s lalu</p>}
                    </div>
                    {editorMode === "edit" && activeId && (
                        <button onClick={() => onDelete([activeId])} title="Hapus Soal"
                            className="w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-200"
                            style={{ color: "var(--text-3)", borderColor: "var(--border)", background: "transparent" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border)"; }}
                        >
                            <Trash2 size={15} strokeWidth={1.5} />
                        </button>
                    )}
                </div>

                {/* Type Selector */}
                <div className="mb-5">
                    <Label>Tipe Soal</Label>
                    <div className="flex gap-2 flex-wrap">
                        {QUESTION_TYPES.map((t) => (
                            <button key={t.value} onClick={() => onTypeChange(t.value)}
                                className="px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all duration-200"
                                style={form.type === t.value
                                    ? { background: "var(--primary-bg)", borderColor: "var(--primary-border)", color: "var(--primary)" }
                                    : { background: "transparent", borderColor: "var(--border)", color: "var(--text-2)" }
                                }
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="mb-5">
                    <Label>Konten Soal</Label>
                    <textarea
                        id="qb-editor-content"
                        value={form.content}
                        onChange={(e) => setForm({ content: e.target.value })}
                        placeholder="Ketik soal di sini..."
                        className="w-full min-h-[130px] rounded-2xl text-[13px] px-5 py-3.5 outline-none resize-y border transition-all duration-200 leading-relaxed"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-0)" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary-border)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-bg)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                </div>

                {/* Multiple Choice */}
                {form.type === "multiple_choice" && (
                    <div className="mb-5">
                        <Label>Pilihan Jawaban</Label>
                        <div className="flex flex-col gap-2">
                            {mcOptions.map((opt, idx) => (
                                <div key={`${opt.id}-${idx}`} className="flex items-center gap-2.5">
                                    <button
                                        onClick={() => setForm({ answer_key: opt.id })} title="Pilih jawaban benar"
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0 border transition-all duration-200"
                                        style={String(form.answer_key) === opt.id
                                            ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)", boxShadow: "0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent)" }
                                            : { background: "var(--surface-2)", color: "var(--text-2)", borderColor: "var(--border)" }
                                        }
                                    >
                                        {opt.id}
                                    </button>
                                    <FieldInput value={opt.label} onChange={(e) => updateOption(idx, { label: e.target.value })} placeholder={`Opsi ${opt.id}...`}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }} className="flex-1"
                                    />
                                    <button onClick={() => removeOption(idx)} disabled={mcOptions.length <= 2}
                                        className="w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                        style={{ color: "var(--text-3)", borderColor: "var(--border)", background: "transparent" }}
                                        onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.08)"; } }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; }}
                                    >
                                        <X size={14} strokeWidth={1.5} />
                                    </button>
                                </div>
                            ))}
                            <button onClick={addOption}
                                className="flex items-center gap-2 mt-1 px-4 py-2.5 rounded-xl border border-dashed text-[13px] font-medium transition-all duration-200"
                                style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-border)"; e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.background = "var(--primary-bg)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; }}
                            >
                                <Plus size={13} /> Tambah opsi
                            </button>
                        </div>
                    </div>
                )}

                {/* True/False */}
                {form.type === "true_false" && (
                    <div className="mb-5">
                        <Label>Jawaban Benar</Label>
                        <div className="flex gap-2.5">
                            {[
                                { val: true, label: "Benar", icon: <CheckCircle2 size={15} strokeWidth={1.5} /> },
                                { val: false, label: "Salah", icon: <XCircle size={15} strokeWidth={1.5} /> },
                            ].map(({ val, label, icon }) => (
                                <button key={String(val)} onClick={() => setForm({ answer_key: val })}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold border transition-all duration-200"
                                    style={form.answer_key === val
                                        ? { background: "var(--primary-bg)", borderColor: "var(--primary-border)", color: "var(--primary)" }
                                        : { background: "transparent", borderColor: "var(--border)", color: "var(--text-2)" }
                                    }
                                >
                                    {icon} {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Short Answer */}
                {form.type === "short_answer" && (
                    <div className="mb-5">
                        <Label>Jawaban Benar</Label>
                        <FieldInput value={String(form.answer_key ?? "")} onChange={(e) => setForm({ answer_key: e.target.value })} placeholder="Jawaban isian..." />
                    </div>
                )}

                {/* Metadata */}
                <div className="mb-5">
                    <Label>Metadata</Label>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Topic</p>
                            <FieldInput value={form.topic ?? ""} onChange={(e) => setForm({ topic: e.target.value })} placeholder="Topik..." />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Difficulty</p>
                            <CustomSelect value={form.difficulty ?? ""} onChange={(v) => setForm({ difficulty: v })} placeholder="Pilih..." options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Status</p>
                            <CustomSelect value={form.status ?? "published"} onChange={(v) => setForm({ status: v as any })} placeholder="Pilih..." options={[{ value: "draft", label: "Draft" }, { value: "review", label: "Review" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }]} />
                        </div>
                    </div>
                </div>

                {/* Tags */}
                <div className="mb-5">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2 items-center">
                        {(form.tags ?? []).map((tag, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--primary-bg)", color: "var(--primary)", border: "1px solid var(--primary-border)" }}>
                                {tag}
                                <span onClick={() => setForm({ tags: (form.tags ?? []).filter((_, i) => i !== idx) })} className="cursor-pointer opacity-60 hover:opacity-100 transition-opacity flex items-center">
                                    <X size={10} strokeWidth={2.5} />
                                </span>
                            </span>
                        ))}
                        <button onClick={() => { const tag = window.prompt("Tag baru:"); if (tag?.trim()) setForm({ tags: [...(form.tags ?? []), tag.trim()] }); }}
                            className="px-3 py-1 rounded-full text-xs font-medium border border-dashed transition-all duration-200"
                            style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-border)"; e.currentTarget.style.color = "var(--primary)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-3)"; }}
                        >
                            + Tag
                        </button>
                    </div>
                </div>

                {/* Media */}
                <div className="mb-6">
                    <Label>Media &amp; Lampiran</Label>
                    {(form.media_urls ?? []).length > 0 && <MediaPreview media={form.media_urls ?? []} onRemove={removeMedia} />}
                    {form.image_url && (form.media_urls ?? []).length === 0 && (
                        <div className="flex gap-3 mb-3">
                            <div className="w-32 h-20 rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                                <img src={form.image_url} alt="Question" className="w-full h-full object-cover" />
                            </div>
                        </div>
                    )}
                    <div
                        className="mt-2 flex flex-col items-center justify-center gap-2 border border-dashed rounded-2xl py-7 cursor-pointer transition-all duration-200 group"
                        style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-border)"; e.currentTarget.style.background = "var(--primary-bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "transparent"; }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files); }}
                        onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*,audio/*,video/*"; i.multiple = true; i.onchange = () => { if (i.files?.length) handleFileUpload(i.files); }; i.click(); }}
                    >
                        <Paperclip size={18} strokeWidth={1.5} />
                        <p className="text-xs text-center leading-relaxed" style={{ color: "var(--text-3)" }}>Drop file atau <span style={{ color: "var(--primary)", fontWeight: 600 }}>klik untuk upload</span></p>
                    </div>
                    {uploadProgress !== null && (
                        <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: "var(--primary)" }} />
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <button id="qb-save-btn" onClick={onSave} disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "var(--primary)", color: "#fff", borderColor: "var(--primary-border)", boxShadow: "0 4px 12px color-mix(in srgb, var(--primary) 28%, transparent)" }}
                    >
                        <Save size={14} strokeWidth={2} />
                        {isSaving ? "Menyimpan..." : editorMode === "edit" ? "Update Soal" : "Simpan Soal"}
                    </button>
                    {editorMode === "edit" && (
                        <button onClick={resetEditor}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium border transition-all duration-200"
                            style={{ background: "transparent", borderColor: "var(--border)", color: "var(--text-2)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-0)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)"; }}
                        >
                            <RotateCcw size={13} strokeWidth={1.5} /> Batal
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}