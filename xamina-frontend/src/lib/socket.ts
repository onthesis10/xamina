import { resolveWsBaseUrl } from "@/lib/api-base";
import { useAuthStore } from "@/store/auth.store";

export type WsEventType =
    | "StudentConnected"
    | "StudentDisconnected"
    | "AnswerSaved"
    | "AnomalyDetected"
    | "StudentFinished"
    | "Heartbeat"
    | "HeartbeatAck"
    | "ForceSubmit"
    | "ForceSubmitAck"
    | "MonitorJoined"
    | "Error";

export interface WsEvent {
    type: WsEventType;
    data?: Record<string, unknown>;
}

export type WsEventHandler = (event: WsEvent) => void;

interface ExamSocketOptions {
    examId: string;
    onMessage: WsEventHandler;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
}

class ExamSocket {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private opts: ExamSocketOptions;
    private _closed = false;

    constructor(opts: ExamSocketOptions) {
        this.opts = opts;
        this.connect();
    }

    private connect() {
        if (this._closed) return;

        const token = useAuthStore.getState().accessToken;
        if (!token) {
            console.warn("[WS] No auth token, cannot connect");
            return;
        }

        const wsBase = resolveWsBaseUrl(import.meta.env.VITE_API_URL);
        const url = `${wsBase}/ws/exam/${this.opts.examId}?token=${encodeURIComponent(token)}`;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.opts.onOpen?.();
        };

        this.ws.onmessage = (event) => {
            try {
                const parsed: WsEvent = JSON.parse(event.data);
                this.opts.onMessage(parsed);
            } catch {
                console.warn("[WS] Failed to parse message:", event.data);
            }
        };

        this.ws.onclose = () => {
            this.stopHeartbeat();
            this.opts.onClose?.();
            this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
            console.error("[WS] Error:", error);
            this.opts.onError?.(error);
        };
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        const user = useAuthStore.getState().user;
        this.heartbeatTimer = setInterval(() => {
            this.send({
                type: "Heartbeat",
                data: { student_id: user?.id },
            });
        }, 15000);
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private attemptReconnect() {
        if (this._closed) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn("[WS] Max reconnect attempts reached");
            return;
        }

        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    send(event: WsEvent) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(event));
        }
    }

    close() {
        this._closed = true;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    get connected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

export function createExamSocket(opts: ExamSocketOptions): ExamSocket {
    return new ExamSocket(opts);
}
