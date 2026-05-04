import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
    Timer,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Circle,
    Wifi,
    WifiOff,
    Bookmark,
    Send,
    Moon,
    Sun,
    Sparkles,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { errorMessageForCode } from "@/lib/axios";
import { createExamSocket, type WsEvent } from "@/lib/socket";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/store/toast.store";
import type {
    SessionQuestionDto,
    SubmissionAnswerInput,
    SubmissionSessionDto,
} from "@/types/api.types";

import { sessionApi } from "./session.api";
import { ExamCompanion, type CompanionTheme } from "./ExamCompanion";
import { XaminaLogo } from "@/components/XaminaLogo";

/* ─── Types ──────────────────────────────────────────────── */
type LocalAnswerMap = Record<
    string,
    { answer: unknown; is_bookmarked: boolean }
>;

/* ─── Theme Config ───────────────────────────────────────── */
const THEMES: Record<
    CompanionTheme,
    {
        label: string;
        root: string;
        glass: string;
        questionCard: string;
        optionBase: string;
        optionSelected: string;
        optionLetter: string;
        optionLetterSelected: string;
        timerNormal: string;
        timerPanic: string;
        navBtn: string;
        progressTrack: string;
        metaText: string;
        sectionLabel: string;
        paletteUnanswered: string;
        paletteAnswered: string;
        paletteCurrent: string;
        progressCard: string;
        textPrimary: string;
        textSecondary: string;
        textarea: string;
        divider: string;
    }
> = {
    dark: {
        label: "Night",
        root: "bg-[#09090f]",
        glass: "bg-[#0d0d16]/70 border-white/[0.07] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
        questionCard: "bg-[#111119]/75 border-white/[0.07] shadow-black/40 backdrop-blur-xl",
        optionBase: "bg-white/[0.03] border-white/[0.07] hover:border-orange-500/30 hover:bg-orange-500/[0.04] hover:translate-x-1",
        optionSelected: "bg-orange-500/[0.09] border-orange-500/40 translate-x-1",
        optionLetter: "bg-white/[0.06] text-slate-400",
        optionLetterSelected: "bg-orange-500 text-white shadow-[0_4px_12px_rgba(249,115,22,0.45)]",
        timerNormal: "bg-[#0d0d16]/70 border-white/[0.08] text-slate-200 backdrop-blur-xl",
        timerPanic: "bg-red-500/10 border-red-500/30 text-red-400 backdrop-blur-xl",
        navBtn: "text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]",
        progressTrack: "bg-white/[0.06]",
        metaText: "text-slate-500",
        sectionLabel: "text-slate-600",
        paletteUnanswered: "bg-white/[0.04] border-white/[0.08] text-slate-500 hover:bg-white/[0.09] hover:text-slate-300",
        paletteAnswered: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        paletteCurrent: "bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.4)]",
        progressCard: "bg-white/[0.03] border-white/[0.05]",
        textPrimary: "text-slate-100",
        textSecondary: "text-slate-300",
        textarea: "bg-white/[0.03] border-white/[0.08] text-slate-200 placeholder:text-slate-600 focus:border-orange-500/50 focus:bg-[#111119]/80",
        divider: "border-white/[0.05]",
    },
    light: {
        label: "Fresh",
        root: "bg-[#f4f2ee]",
        glass: "bg-white/65 border-slate-200/70 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.07)]",
        questionCard: "bg-white/80 border-slate-200/60 shadow-slate-200/60 backdrop-blur-xl shadow-xl",
        optionBase: "bg-white/70 border-slate-200 hover:border-orange-300 hover:bg-orange-50/50 hover:translate-x-1 shadow-sm",
        optionSelected: "bg-orange-50 border-orange-400/60 translate-x-1 shadow-[inset_0_0_0_1px_rgba(234,88,12,0.1),0_4px_12px_rgba(234,88,12,0.08)]",
        optionLetter: "bg-slate-100 text-slate-500",
        optionLetterSelected: "bg-orange-500 text-white shadow-[0_4px_12px_rgba(249,115,22,0.35)]",
        timerNormal: "bg-white/75 border-slate-200 text-slate-700 backdrop-blur-xl shadow-sm",
        timerPanic: "bg-red-50/80 border-red-300 text-red-600 backdrop-blur-xl",
        navBtn: "text-slate-400 hover:text-slate-700 hover:bg-slate-100/80",
        progressTrack: "bg-slate-200",
        metaText: "text-slate-400",
        sectionLabel: "text-slate-400",
        paletteUnanswered: "bg-white/80 border-slate-200 text-slate-500 hover:border-orange-300 hover:text-slate-700 shadow-sm",
        paletteAnswered: "bg-emerald-50 border-emerald-200 text-emerald-600",
        paletteCurrent: "bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.3)]",
        progressCard: "bg-white/60 border-slate-200/40",
        textPrimary: "text-slate-800",
        textSecondary: "text-slate-700",
        textarea: "bg-white/80 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:bg-white shadow-sm",
        divider: "border-slate-200/50",
    },
    happy: {
        label: "Party",
        root: "bg-[#fdf4ff]",
        glass: "bg-white/65 border-fuchsia-200/50 backdrop-blur-2xl shadow-[0_8px_32px_rgba(192,38,211,0.08)]",
        questionCard: "bg-white/80 border-fuchsia-200/50 shadow-fuchsia-100/40 backdrop-blur-xl shadow-xl",
        optionBase: "bg-white/70 border-fuchsia-100 hover:border-fuchsia-300 hover:bg-fuchsia-50/50 hover:translate-x-1 shadow-sm",
        optionSelected: "bg-fuchsia-50 border-fuchsia-400/50 translate-x-1 shadow-[inset_0_0_0_1px_rgba(192,38,211,0.08),0_4px_12px_rgba(192,38,211,0.08)]",
        optionLetter: "bg-fuchsia-50 text-fuchsia-400",
        optionLetterSelected: "bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-[0_4px_12px_rgba(192,38,211,0.4)]",
        timerNormal: "bg-white/75 border-fuchsia-200/60 text-fuchsia-700 backdrop-blur-xl shadow-sm",
        timerPanic: "bg-red-50/80 border-red-300 text-red-500 backdrop-blur-xl",
        navBtn: "text-fuchsia-300 hover:text-fuchsia-700 hover:bg-fuchsia-50",
        progressTrack: "bg-fuchsia-100",
        metaText: "text-fuchsia-400",
        sectionLabel: "text-fuchsia-300",
        paletteUnanswered: "bg-white/80 border-fuchsia-100 text-fuchsia-400 hover:border-fuchsia-300 hover:text-fuchsia-600 shadow-sm",
        paletteAnswered: "bg-emerald-50 border-emerald-200 text-emerald-600",
        paletteCurrent: "bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-[0_4px_14px_rgba(192,38,211,0.35)]",
        progressCard: "bg-white/60 border-fuchsia-100/50",
        textPrimary: "text-slate-800",
        textSecondary: "text-slate-700",
        textarea: "bg-white/80 border-fuchsia-200 text-slate-800 placeholder:text-fuchsia-300 focus:border-fuchsia-400 focus:bg-white shadow-sm",
        divider: "border-fuchsia-100/60",
    },
};

/* ─── Helpers ────────────────────────────────────────────── */
function toAnswerMap(session: SubmissionSessionDto): LocalAnswerMap {
    const map: LocalAnswerMap = {};
    for (const answer of session.answers) {
        map[answer.question_id] = {
            answer: answer.answer_jsonb,
            is_bookmarked: answer.is_bookmarked,
        };
    }
    return map;
}

function formatRemaining(seconds: number | null): string {
    if (seconds === null) return "--:--";
    const safe = Math.max(0, seconds);
    const mm = Math.floor(safe / 60).toString().padStart(2, "0");
    const ss = Math.floor(safe % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
}

/* ─── Ambient Background per Theme ──────────────────────── */
function AmbientBg({ theme }: { theme: CompanionTheme }) {
    if (theme === "dark") return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-orange-600/[0.07] blur-[120px] animate-[drift_20s_ease-in-out_infinite]" />
            <div className="absolute -bottom-40 -right-20 w-[700px] h-[700px] rounded-full bg-violet-600/[0.05] blur-[140px] animate-[drift_28s_ease-in-out_infinite_reverse]" />
            <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] rounded-full bg-orange-500/[0.03] blur-[90px] animate-[drift_35s_ease-in-out_infinite]" />
        </div>
    );
    if (theme === "light") return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="absolute -top-20 right-0 w-[500px] h-[500px] rounded-full bg-orange-200/40 blur-[100px]" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[400px] rounded-full bg-sky-200/30 blur-[120px]" />
            <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] rounded-full bg-amber-100/60 blur-[80px]" />
        </div>
    );
    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="absolute -top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-fuchsia-300/20 blur-[100px] animate-[drift_18s_ease-in-out_infinite]" />
            <div className="absolute -bottom-32 right-0 w-[600px] h-[600px] rounded-full bg-pink-300/15 blur-[120px] animate-[drift_24s_ease-in-out_infinite_reverse]" />
            <div className="absolute top-1/3 left-0 w-[350px] h-[350px] rounded-full bg-violet-300/15 blur-[80px]" />
        </div>
    );
}

/* ─── Confetti ───────────────────────────────────────────── */
function Confetti({ active }: { active: boolean }) {
    if (!active) return null;
    const pieces = Array.from({ length: 18 }, (_, i) => i);
    const colors = ["#f0abfc", "#f9a8d4", "#fde68a", "#86efac", "#93c5fd", "#c4b5fd"];
    return (
        <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
            {pieces.map((i) => {
                const color = colors[i % colors.length];
                const left = `${(i / pieces.length) * 100 + Math.sin(i) * 5}%`;
                const delay = `${(i * 0.18) % 2}s`;
                const size = 6 + (i % 4) * 2;
                return (
                    <motion.div
                        key={i}
                        initial={{ y: -20, opacity: 1, rotate: 0, x: 0 }}
                        animate={{ y: "100vh", opacity: [1, 1, 0], rotate: 360 * (i % 2 === 0 ? 1 : -1), x: Math.sin(i) * 40 }}
                        transition={{ duration: 3.5, delay: parseFloat(delay), repeat: Infinity, repeatDelay: 1.5, ease: "easeIn" }}
                        style={{ position: "absolute", left, top: 0, width: size, height: size, background: color, borderRadius: i % 3 === 0 ? "50%" : "2px" }}
                    />
                );
            })}
        </div>
    );
}

/* ─── Theme Icon ─────────────────────────────────────────── */
function ThemeIcon({ theme, size = 15 }: { theme: CompanionTheme; size?: number }) {
    if (theme === "dark") return <Moon size={size} />;
    if (theme === "light") return <Sun size={size} />;
    return <Sparkles size={size} />;
}

/* ─── Main Component ─────────────────────────────────────── */
export function ExamSessionPanel({ submissionId }: { submissionId: string }) {
    const navigate = useNavigate();
    const toast = useToast();
    const wsRef = useRef<ReturnType<typeof createExamSocket> | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
    const [answerMap, setAnswerMap] = useState<LocalAnswerMap>({});
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const hydratedRef = useRef(false);
    const finishRequestedRef = useRef(false);
    const [isIdle, setIsIdle] = useState(false);
    const [lastAnsweredAt, setLastAnsweredAt] = useState<number | null>(null);
    const [theme, setTheme] = useState<CompanionTheme>("light");
    const [showConfetti, setShowConfetti] = useState(false);
    const T = THEMES[theme];

    const cycleTheme = () => {
        setTheme((t) => {
            const next = t === "light" ? "dark" : t === "dark" ? "happy" : "light";
            if (next === "happy") {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 5000);
            }
            return next;
        });
    };

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        const resetIdle = () => {
            setIsIdle(false);
            clearTimeout(timeout);
            timeout = setTimeout(() => setIsIdle(true), 30000);
        };
        window.addEventListener("mousemove", resetIdle);
        window.addEventListener("keydown", resetIdle);
        window.addEventListener("click", resetIdle);
        resetIdle();
        return () => {
            clearTimeout(timeout);
            window.removeEventListener("mousemove", resetIdle);
            window.removeEventListener("keydown", resetIdle);
            window.removeEventListener("click", resetIdle);
        };
    }, []);

    const sessionQuery = useQuery({
        queryKey: ["submission-session", submissionId],
        queryFn: () => sessionApi.getSubmission(submissionId),
        refetchInterval: 30_000,
    });

    useEffect(() => {
        if (!sessionQuery.data) return;
        setRemainingSeconds(sessionQuery.data.remaining_seconds);
        if (!hydratedRef.current) {
            setAnswerMap(toAnswerMap(sessionQuery.data));
            hydratedRef.current = true;
        }
    }, [sessionQuery.data]);

    useEffect(() => {
        const interval = setInterval(() => {
            setRemainingSeconds((old) => (old !== null ? Math.max(0, old - 1) : null));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const saveAnswersMutation = useMutation({
        mutationFn: (answers: SubmissionAnswerInput[]) =>
            sessionApi.upsertAnswers(submissionId, answers),
        onError: (error) => {
            toast.error(errorMessageForCode(error, { SUBMISSION_FINISHED: "Sesi sudah selesai." }, "Gagal menyimpan jawaban."));
        },
    });

    const finishMutation = useMutation({
        mutationFn: () => sessionApi.finishSubmission(submissionId),
        onSuccess: () => {
            toast.success("Ujian selesai. Menampilkan hasil.");
            navigate({ to: "/app/my-exams/result/$submissionId", params: { submissionId } });
        },
        onError: (error) => {
            finishRequestedRef.current = false;
            toast.error(errorMessageForCode(error, {}, "Gagal menyelesaikan submission."));
        },
    });

    const triggerFinish = useCallback(() => {
        if (finishRequestedRef.current || finishMutation.isPending) return;
        finishRequestedRef.current = true;
        finishMutation.mutate();
    }, [finishMutation]);

    useEffect(() => {
        if (remainingSeconds === 0 && sessionQuery.data?.status === "in_progress") {
            toast.info("⏰ Waktu habis! Ujian dikirim otomatis.");
            triggerFinish();
        }
    }, [remainingSeconds, sessionQuery.data?.status, triggerFinish, toast]);

    const anomalyMutation = useMutation({
        mutationFn: (eventType: string) =>
            sessionApi.logAnomaly(submissionId, { event_type: eventType, payload_jsonb: { at: new Date().toISOString() } }),
    });

    // Fast autosave (1.5s) — keeps dirty answers safe in normal flow
    useEffect(() => {
        const interval = setInterval(() => {
            if (dirtyIds.size === 0 || saveAnswersMutation.isPending) return;
            const payload: SubmissionAnswerInput[] = Array.from(dirtyIds).map((qId) => ({
                question_id: qId,
                answer: answerMap[qId]?.answer,
                is_bookmarked: answerMap[qId]?.is_bookmarked ?? false,
            }));
            saveAnswersMutation.mutate(payload, { onSuccess: () => setDirtyIds(new Set()) });
        }, 1500);
        return () => clearInterval(interval);
    }, [answerMap, dirtyIds, saveAnswersMutation]);

    // Synchronous flush on tab unload/hide using fetch keepalive — guarantees save before refresh
    useEffect(() => {
        const flushDirty = () => {
            if (dirtyIds.size === 0) return;
            const token = useAuthStore.getState().accessToken;
            if (!token) return;
            const payload = Array.from(dirtyIds).map((qId) => ({
                question_id: qId,
                answer: answerMap[qId]?.answer,
                is_bookmarked: answerMap[qId]?.is_bookmarked ?? false,
            }));
            try {
                fetch(`${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/submissions/${submissionId}/answers`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ answers: payload }),
                    keepalive: true,
                });
            } catch {
                // best-effort during unload — ignore
            }
        };
        const handleVisibility = () => {
            if (document.visibilityState === "hidden") flushDirty();
        };
        window.addEventListener("beforeunload", flushDirty);
        window.addEventListener("pagehide", flushDirty);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            window.removeEventListener("beforeunload", flushDirty);
            window.removeEventListener("pagehide", flushDirty);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [answerMap, dirtyIds, submissionId]);

    useEffect(() => {
        const session = sessionQuery.data;
        if (!session || session.status !== "in_progress") return;
        const socket = createExamSocket({
            examId: session.exam_id,
            onMessage: (event: WsEvent) => {
                if (event.type === "ForceSubmitAck") {
                    const sid = String(event.data?.submission_id ?? "");
                    if (!sid || sid === submissionId) {
                        toast.error("Submission dipaksa selesai oleh monitor");
                        triggerFinish();
                    }
                }
            },
        });
        wsRef.current = socket;
        const checkOnline = setInterval(() => setIsOnline(navigator.onLine), 3000);
        return () => { socket.close(); wsRef.current = null; clearInterval(checkOnline); };
    }, [sessionQuery.data, submissionId, toast, triggerFinish]);

    useEffect(() => {
        const enterFullscreen = async () => {
            try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); }
            catch (err) { console.warn("[Exam] Fullscreen denied:", err); }
        };
        enterFullscreen();
        return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); };
    }, []);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) { anomalyMutation.mutate("tab_hidden"); toast.error("⚠️ Peringatan: Jangan meninggalkan tab ujian!"); }
        };
        const blockCopy = (e: ClipboardEvent) => { e.preventDefault(); anomalyMutation.mutate("copy_attempt"); };
        const blockCtxMenu = (e: MouseEvent) => e.preventDefault();
        document.addEventListener("visibilitychange", handleVisibility);
        document.addEventListener("copy", blockCopy);
        document.addEventListener("contextmenu", blockCtxMenu);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            document.removeEventListener("copy", blockCopy);
            document.removeEventListener("contextmenu", blockCtxMenu);
        };
    }, [anomalyMutation, toast]);

    const questions = useMemo(() => sessionQuery.data?.questions ?? [], [sessionQuery.data]);
    const currentQuestion = questions[currentIndex] ?? null;

    const updateAnswer = (questionId: string, nextValue: unknown) => {
        setLastAnsweredAt(Date.now());
        setAnswerMap((old) => ({
            ...old,
            [questionId]: { answer: nextValue, is_bookmarked: old[questionId]?.is_bookmarked ?? false },
        }));
        setDirtyIds((old) => { const next = new Set(old); next.add(questionId); return next; });
    };

    const toggleBookmark = (questionId: string) => {
        setAnswerMap((old) => ({
            ...old,
            [questionId]: { answer: old[questionId]?.answer ?? null, is_bookmarked: !(old[questionId]?.is_bookmarked ?? false) },
        }));
        setDirtyIds((old) => { const next = new Set(old); next.add(questionId); return next; });
    };

    const answeredCount = questions.filter((q) => !!answerMap[q.question_id]?.answer).length;
    const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;
    const isPanic = remainingSeconds !== null && remainingSeconds < 300;

    /* ── Loading ── */
    if (sessionQuery.isLoading) return (
        <div className={`fixed inset-0 flex flex-col items-center justify-center gap-5 ${T.root}`}>
            <AmbientBg theme={theme} />
            <div className="w-10 h-10 rounded-full border-2 border-orange-500/20 border-t-orange-500 animate-spin" />
            <p className={`text-xs font-semibold tracking-widest uppercase ${T.metaText}`}>
                Menyiapkan lembar ujian…
            </p>
        </div>
    );

    /* ── Error ── */
    if (sessionQuery.isError || !sessionQuery.data) return (
        <div className={`fixed inset-0 flex items-center justify-center ${T.root}`}>
            <div className={`p-10 rounded-3xl border text-center ${T.questionCard}`}>
                <p className="text-red-500 font-bold">Gagal memuat sesi ujian.</p>
            </div>
        </div>
    );

    /* ── Finished ── */
    if (sessionQuery.data.status !== "in_progress") return (
        <div className={`fixed inset-0 flex items-center justify-center ${T.root}`}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`p-10 rounded-3xl border text-center max-w-sm w-full mx-6 ${T.questionCard}`}
            >
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                    <CheckCircle2 size={28} className="text-orange-500" />
                </div>
                <h3 className={`text-2xl font-black mb-2 ${T.textPrimary}`}>Sesi Selesai</h3>
                <p className={`text-sm mb-8 ${T.metaText}`}>Ujian ini sudah berakhir atau sudah diselesaikan.</p>
                <button
                    className="w-full py-3 px-6 rounded-2xl bg-orange-500 text-white font-bold text-sm tracking-wide hover:bg-orange-600 transition-colors"
                    onClick={() => navigate({ to: "/app/my-exams/result/$submissionId", params: { submissionId } })}
                >
                    Lihat Hasil
                </button>
            </motion.div>
        </div>
    );

    /* ─────────────────────────────────────────────────────── */
    /*  MAIN RENDER                                            */
    /* ─────────────────────────────────────────────────────── */
    return (
        <div
            className={`fixed inset-0 z-[999] ${T.root} overflow-hidden transition-colors duration-700`}
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
            <AmbientBg theme={theme} />
            <Confetti active={showConfetti} />
            <ExamCompanion theme={theme} timeLeft={remainingSeconds} isIdle={isIdle} lastAnsweredAt={lastAnsweredAt} />

            {/* ── Floating Top-Left: Logo + Exam Info ── */}
            <motion.div
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`fixed top-4 left-4 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-colors duration-700 ${T.glass}`}
            >
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                    <XaminaLogo variant="animated-icon" style={{ transform: "scale(0.45)" }} />
                </div>
                <div className="min-w-0">
                    <h2 className={`text-[12px] font-black truncate max-w-[140px] lg:max-w-[220px] leading-tight ${T.textPrimary}`}>
                        {sessionQuery.data.exam_title}
                    </h2>
                    <div className="flex items-center gap-1 mt-0.5">
                        {isOnline
                            ? <Wifi size={8} className="text-emerald-500" />
                            : <WifiOff size={8} className="text-red-500" />}
                        <span className={`text-[8px] uppercase tracking-wider font-bold ${T.metaText}`}>
                            {isOnline ? "Live" : "Offline · Auto-save"}
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* ── Floating Top-Center: Timer ── */}
            <motion.div
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-500 ${isPanic ? T.timerPanic : T.timerNormal}`}
            >
                <Timer size={13} className={isPanic ? "animate-pulse" : ""} />
                <span
                    className="text-sm font-black tabular-nums tracking-tight"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                    {formatRemaining(remainingSeconds)}
                </span>
                {isPanic && (
                    <span className="text-[8px] font-black uppercase tracking-widest animate-pulse">SEGERA</span>
                )}
            </motion.div>

            {/* ── Floating Top-Right: Controls ── */}
            <motion.div
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="fixed top-4 right-4 z-50 flex items-center gap-2"
            >
                {/* Theme toggle */}
                <button
                    onClick={cycleTheme}
                    title={T.label}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all duration-300 active:scale-95 hover:scale-105 ${T.glass} ${T.metaText}`}
                >
                    <ThemeIcon theme={theme} size={14} />
                    <span className="hidden sm:inline text-[10px] uppercase tracking-wider">{T.label}</span>
                </button>

                {/* Finish */}
                <button
                    onClick={() => setShowFinishConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 hover:scale-105 shadow-[0_4px_16px_rgba(234,88,12,0.35)]"
                >
                    <Send size={12} />
                    <span className="hidden sm:inline">Selesai</span>
                </button>
            </motion.div>

            {/* ── Floating Question Nav (right side, half height) ── */}
            <motion.div
                initial={{ x: -48, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={`hidden lg:flex fixed left-4 top-[72px] z-40 w-72 max-h-[58vh] flex-col rounded-2xl border overflow-hidden transition-colors duration-700 ${T.glass}`}
            >
                {/* Nav header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${T.divider}`}>
                    <div>
                        <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${T.sectionLabel}`}>Navigasi Soal</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold tabular-nums ${T.textPrimary}`}>{answeredCount}</span>
                            <span className={`text-[9px] ${T.metaText}`}>dari {questions.length} terjawab</span>
                        </div>
                    </div>
                    {/* Bookmark count badge */}
                    {questions.filter(q => answerMap[q.question_id]?.is_bookmarked).length > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400/15 border border-amber-400/25">
                            <Bookmark size={10} className="text-amber-500 fill-amber-400" />
                            <span className="text-[10px] font-bold text-amber-500">
                                {questions.filter(q => answerMap[q.question_id]?.is_bookmarked).length}
                            </span>
                        </div>
                    )}
                </div>

                {/* Question grid */}
                <div className="overflow-y-auto flex-1 p-4">
                    <div className="grid grid-cols-5 gap-2">
                        {questions.map((q, idx) => {
                            const isAnswered = !!answerMap[q.question_id]?.answer;
                            const isCurrent = idx === currentIndex;
                            const isBookmarked = answerMap[q.question_id]?.is_bookmarked;
                            return (
                                <button
                                    key={q.question_id}
                                    onClick={() => setCurrentIndex(idx)}
                                    title={`Soal ${idx + 1}${isAnswered ? " · Terjawab" : ""}${isBookmarked ? " · Ditandai" : ""}`}
                                    className={`relative h-11 rounded-xl flex items-center justify-center text-[11px] font-bold border transition-all duration-200 hover:scale-105 active:scale-95 ${isCurrent ? T.paletteCurrent
                                        : isAnswered ? T.paletteAnswered
                                            : T.paletteUnanswered
                                        }`}
                                >
                                    {idx + 1}
                                    {isBookmarked && (
                                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center shadow-[0_2px_6px_rgba(251,191,36,0.5)]">
                                            <Bookmark size={8} className="text-white fill-white" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className={`flex flex-col gap-1.5 mt-4 pt-4 border-t ${T.divider}`}>
                        {[
                            { cls: T.paletteCurrent, label: "Sedang dikerjakan" },
                            { cls: T.paletteAnswered, label: "Terjawab" },
                            { cls: T.paletteUnanswered, label: "Belum dijawab" },
                        ].map(({ cls, label }) => (
                            <div key={label} className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-md border flex-shrink-0 ${cls}`} />
                                <span className={`text-[9px] font-semibold ${T.metaText}`}>{label}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2">
                            <div className="relative w-4 h-4 flex-shrink-0">
                                <div className={`w-4 h-4 rounded-md border ${T.paletteUnanswered}`} />
                                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 flex items-center justify-center">
                                    <Bookmark size={6} className="text-white fill-white" />
                                </div>
                            </div>
                            <span className={`text-[9px] font-semibold ${T.metaText}`}>Ditandai</span>
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className={`px-4 py-3 border-t shrink-0 ${T.divider}`}>
                    <div className="flex justify-between items-baseline mb-1.5">
                        <span className={`text-[8px] font-black uppercase tracking-widest ${T.sectionLabel}`}>Progres</span>
                        <span className={`text-sm font-black ${T.textPrimary}`}>{Math.round(progress)}%</span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${T.progressTrack}`}>
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${theme === "happy"
                                ? "bg-gradient-to-r from-fuchsia-500 to-pink-400"
                                : "bg-orange-500"
                                }`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </motion.div>

            {/* ── Main Scrollable Content ── */}
            <div className="h-full overflow-y-auto overscroll-contain relative z-10">
                <div className="max-w-full xl:max-w-5xl mx-auto px-6 sm:px-10 pt-20 pb-10 lg:pl-[312px]">
                    <AnimatePresence mode="wait">
                        {currentQuestion && (
                            <motion.div
                                key={currentQuestion.question_id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
                            >
                                {/* Question Header */}
                                <div className="flex items-start justify-between gap-4 mb-7">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-orange-500 bg-orange-500/10 flex-shrink-0">
                                            {currentIndex + 1}
                                        </div>
                                        <div>
                                            <p className={`text-[9px] font-black uppercase tracking-[0.14em] ${T.sectionLabel}`}>
                                                Soal {currentIndex + 1} dari {questions.length}
                                            </p>
                                            <p className={`text-[11px] font-medium capitalize ${T.metaText}`}>
                                                {currentQuestion.type === "multiple_choice" ? "Pilihan Ganda"
                                                    : currentQuestion.type === "true_false" ? "Benar / Salah"
                                                        : "Esai"}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => toggleBookmark(currentQuestion.question_id)}
                                        className={`p-2.5 rounded-xl border transition-all duration-300 hover:scale-110 active:scale-95 ${answerMap[currentQuestion.question_id]?.is_bookmarked
                                            ? "bg-amber-400/15 border-amber-400/30 text-amber-500"
                                            : `${T.progressCard} ${T.metaText} hover:text-amber-500`
                                            }`}
                                    >
                                        <Bookmark
                                            size={16}
                                            fill={answerMap[currentQuestion.question_id]?.is_bookmarked ? "currentColor" : "none"}
                                        />
                                    </button>
                                </div>

                                {/* Question Body */}
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.99 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.06, duration: 0.3 }}
                                    className={`rounded-3xl border p-5 lg:p-6 mb-5 transition-colors duration-700 ${T.questionCard}`}
                                >
                                    <div className={`w-8 h-0.5 rounded-full mb-5 ${theme === "happy" ? "bg-gradient-to-r from-fuchsia-400 to-pink-400" : "bg-orange-500"}`} />
                                    <p
                                        className={`text-base lg:text-[17px] leading-relaxed ${T.textPrimary}`}
                                        style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: "0.005em" }}
                                    >
                                        {currentQuestion.content}
                                    </p>
                                </motion.div>

                                {/* Answer Options */}
                                <div className="space-y-2 mb-6">
                                    {renderAnswers(
                                        currentQuestion,
                                        answerMap[currentQuestion.question_id]?.answer,
                                        (val) => updateAnswer(currentQuestion.question_id, val),
                                        theme,
                                        T,
                                    )}
                                </div>

                                {/* Navigation */}
                                <div className={`flex items-center justify-between pt-6 border-t transition-colors duration-700 ${T.divider}`}>
                                    <button
                                        disabled={currentIndex === 0}
                                        onClick={() => setCurrentIndex((i) => i - 1)}
                                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-25 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${T.navBtn}`}
                                    >
                                        <ChevronLeft size={15} />
                                        Prev
                                    </button>

                                    {/* Dot progress indicator */}
                                    <div className="hidden sm:flex items-center gap-1.5">
                                        {questions.slice(
                                            Math.max(0, currentIndex - 3),
                                            Math.min(questions.length, currentIndex + 4)
                                        ).map((q, i) => {
                                            const actualIdx = Math.max(0, currentIndex - 3) + i;
                                            const isCur = actualIdx === currentIndex;
                                            const isAns = !!answerMap[q.question_id]?.answer;
                                            return (
                                                <button
                                                    key={q.question_id}
                                                    onClick={() => setCurrentIndex(actualIdx)}
                                                    className={`rounded-full transition-all duration-300 hover:scale-125 ${isCur ? "w-5 h-2 bg-orange-500"
                                                        : isAns ? `w-2 h-2 ${theme === "happy" ? "bg-emerald-400" : "bg-emerald-500"}`
                                                            : `w-2 h-2 ${theme === "dark" ? "bg-white/15" : "bg-slate-300"}`
                                                        }`}
                                                />
                                            );
                                        })}
                                    </div>

                                    <button
                                        disabled={currentIndex >= questions.length - 1}
                                        onClick={() => setCurrentIndex((i) => i + 1)}
                                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-25 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${T.navBtn}`}
                                    >
                                        Next
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Auto-save indicator ── */}
            <AnimatePresence>
                {dirtyIds.size > 0 && (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 20, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                        className="fixed bottom-6 right-6 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-orange-600 border border-orange-400/20 shadow-[0_8px_24px_rgba(234,88,12,0.4)] z-50"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white">Menyimpan…</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Finish Dialog ── */}
            <ConfirmDialog
                open={showFinishConfirm}
                title="Selesaikan Ujian?"
                description="Pastikan semua soal sudah dijawab. Anda tidak bisa kembali setelah menekan tombol Selesai."
                confirmLabel={finishMutation.isPending ? "Mengirim…" : "Selesai & Kirim"}
                onCancel={() => setShowFinishConfirm(false)}
                onConfirm={() => {
                    if (dirtyIds.size > 0) {
                        const payload: SubmissionAnswerInput[] = Array.from(dirtyIds).map((id) => ({
                            question_id: id,
                            answer: answerMap[id]?.answer,
                            is_bookmarked: answerMap[id]?.is_bookmarked ?? false,
                        }));
                        saveAnswersMutation.mutate(payload, { onSuccess: () => triggerFinish() });
                        return;
                    }
                    triggerFinish();
                }}
            />
        </div>
    );
}

/* ─── Answer Renderer ────────────────────────────────────── */
function renderAnswers(
    question: SessionQuestionDto,
    value: unknown,
    onChange: (val: unknown) => void,
    _theme: CompanionTheme,
    T: (typeof THEMES)[CompanionTheme],
) {
    if (question.type === "multiple_choice" || question.type === "true_false") {
        const options = Array.isArray(question.options_jsonb) ? question.options_jsonb : [];

        return options.map((option: any, idx: number) => {
            const optVal = option.id ?? (typeof option.value === "boolean" ? option.value : idx.toString());
            const label = option.label ?? (typeof option.value === "boolean" ? (option.value ? "Benar" : "Salah") : String(optVal));
            const isSelected = value === optVal;
            const letter = String.fromCharCode(65 + idx);

            return (
                <button
                    key={idx}
                    onClick={() => onChange(optVal)}
                    className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all duration-200 ${isSelected ? T.optionSelected : T.optionBase}`}
                >
                    <div
                        className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-xs font-black transition-all duration-200 ${isSelected ? T.optionLetterSelected : T.optionLetter}`}
                    >
                        {letter}
                    </div>
                    <span className={`flex-1 text-sm font-medium leading-snug transition-colors duration-200 ${isSelected ? T.textPrimary : T.textSecondary}`}>
                        {label}
                    </span>
                    <div className={`transition-all duration-200 ${isSelected ? "scale-100 opacity-100" : "scale-75 opacity-30"}`}>
                        {isSelected
                            ? <CheckCircle2 size={17} className="text-orange-500" />
                            : <Circle size={17} className={T.metaText} />}
                    </div>
                </button>
            );
        });
    }

    return (
        <textarea
            className={`w-full rounded-3xl p-6 lg:p-7 text-sm leading-relaxed outline-none min-h-[220px] border-2 transition-all duration-300 focus:ring-4 focus:ring-orange-500/10 resize-none ${T.textarea}`}
            placeholder="Tuliskan jawaban Anda secara lengkap di sini…"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        />
    );
}
