// Zustand store — exam session state
interface ExamState {
    timer: number;
    answers: Record<string, string>;
    flagged: Set<string>;
    currentQ: number;
    setTimer: (t: number) => void;
    setAnswer: (qId: string, aId: string) => void;
    toggleFlag: (qId: string) => void;
    reset: () => void;
}

export const useExamStore = create<ExamState>()(
    persist(
        (set) => ({
            timer: 0,
            answers: {},
            flagged: new Set(),
            currentQ: 0,
            setTimer: (t) => set({ timer: t }),
            setAnswer: (qId, aId) =>
                set((s) => ({
                    answers: { ...s.answers, [qId]: aId }
                })),
            toggleFlag: (qId) =>
                set((s) => {
                    const f = new Set(s.flagged);
                    f.has(qId) ? f.delete(qId) : f.add(qId);
                    return { flagged: f };
                }),
            reset: () => set({
                timer: 0, answers: {},
                flagged: new Set(), currentQ: 0,
            }),
        }),
        { name: 'exam-session' }
    )
);
