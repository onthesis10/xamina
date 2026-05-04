import { useEffect } from "react";
import { useQuestionBankStore } from "./question-bank.store.ts";
import { UploadCloud } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function UniversalDropzone() {
    const isDraggingOver = useQuestionBankStore((s) => s.isDraggingOver);
    const setDraggingOver = useQuestionBankStore((s) => s.setDraggingOver);

    useEffect(() => {
        let dragCounter = 0;
        const onDragEnter = (e: DragEvent) => { e.preventDefault(); dragCounter++; if (dragCounter === 1) setDraggingOver(true); };
        const onDragLeave = (e: DragEvent) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; setDraggingOver(false); } };
        const onDragOver = (e: DragEvent) => e.preventDefault();
        const onDrop = (e: DragEvent) => { e.preventDefault(); dragCounter = 0; setDraggingOver(false); };
        window.addEventListener("dragenter", onDragEnter);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onDragEnter);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("drop", onDrop);
        };
    }, [setDraggingOver]);

    return (
        <AnimatePresence>
            {isDraggingOver && (
                <motion.div
                    key="dropzone-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
                    style={{ backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)", background: "rgba(10,6,0,0.55)" }}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col items-center gap-4 px-20 py-14 rounded-3xl border-2 border-[var(--primary)] text-center"
                        style={{
                            background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                            boxShadow: "0 0 80px color-mix(in srgb, var(--primary) 25%, transparent)",
                        }}
                    >
                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
                            <UploadCloud size={36} strokeWidth={1.5} style={{ color: "var(--primary)" }} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold mb-1.5" style={{ color: "var(--text-0)" }}>Drop file di sini</h2>
                            <p className="text-sm" style={{ color: "var(--text-2)" }}>Gambar, Audio, atau Video langsung masuk ke editor.</p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
