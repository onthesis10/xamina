import { create } from "zustand";

export interface ConnectedStudent {
    studentId: string;
    studentName: string;
    answeredCount: number;
    anomalyCount: number;
}

export interface AnomalyAlert {
    id: string;
    studentId: string;
    eventType: string;
    timestamp: string;
}

interface WsState {
    connectionStatus: "disconnected" | "connecting" | "connected";
    connectedStudents: Map<string, ConnectedStudent>;
    anomalyAlerts: AnomalyAlert[];

    setConnectionStatus: (status: WsState["connectionStatus"]) => void;
    addStudent: (studentId: string, studentName: string) => void;
    removeStudent: (studentId: string) => void;
    updateStudentAnswered: (studentId: string, answeredCount: number) => void;
    addAnomaly: (studentId: string, eventType: string) => void;
    markStudentFinished: (studentId: string) => void;
    clearAlerts: () => void;
    reset: () => void;
}

export const useWsStore = create<WsState>()((set) => ({
    connectionStatus: "disconnected",
    connectedStudents: new Map(),
    anomalyAlerts: [],

    setConnectionStatus: (status) => set({ connectionStatus: status }),

    addStudent: (studentId, studentName) =>
        set((state) => {
            const next = new Map(state.connectedStudents);
            if (!next.has(studentId)) {
                next.set(studentId, {
                    studentId,
                    studentName,
                    answeredCount: 0,
                    anomalyCount: 0,
                });
            }
            return { connectedStudents: next };
        }),

    removeStudent: (studentId) =>
        set((state) => {
            const next = new Map(state.connectedStudents);
            next.delete(studentId);
            return { connectedStudents: next };
        }),

    updateStudentAnswered: (studentId, answeredCount) =>
        set((state) => {
            const next = new Map(state.connectedStudents);
            const existing = next.get(studentId);
            if (existing) {
                next.set(studentId, { ...existing, answeredCount });
            }
            return { connectedStudents: next };
        }),

    addAnomaly: (studentId, eventType) =>
        set((state) => {
            const alert: AnomalyAlert = {
                id: `${studentId}-${Date.now()}`,
                studentId,
                eventType,
                timestamp: new Date().toISOString(),
            };
            // Also increment anomaly count on student
            const next = new Map(state.connectedStudents);
            const existing = next.get(studentId);
            if (existing) {
                next.set(studentId, {
                    ...existing,
                    anomalyCount: existing.anomalyCount + 1,
                });
            }
            return {
                anomalyAlerts: [alert, ...state.anomalyAlerts].slice(0, 100),
                connectedStudents: next,
            };
        }),

    markStudentFinished: (studentId) =>
        set((state) => {
            const next = new Map(state.connectedStudents);
            next.delete(studentId);
            return { connectedStudents: next };
        }),

    clearAlerts: () => set({ anomalyAlerts: [] }),

    reset: () =>
        set({
            connectionStatus: "disconnected",
            connectedStudents: new Map(),
            anomalyAlerts: [],
        }),
}));
