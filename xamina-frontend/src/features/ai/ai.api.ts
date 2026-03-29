import { api } from '../../lib/axios';
import { resolveApiBaseUrl } from '@/lib/api-base';
import type { ApiSuccess } from '@/types/api.types';
import { useAuthStore } from '@/store/auth.store';

export interface GenerateQuestionRequest {
    topic: string;
    context?: string;
    question_type: string;
    difficulty: string;
    count: number;
}

export interface AiGeneratedOption {
    text: string;
    is_correct: boolean;
}

export interface AiGeneratedQuestion {
    question_text: string;
    question_type: string;
    options?: AiGeneratedOption[];
    correct_answer_bool?: boolean;
    explanation: string;
}

export interface GenerateQuestionResponse {
    questions: AiGeneratedQuestion[];
}

export interface GenerateStreamHandlers {
    onChunk?: (chunk: string) => void;
    onError?: (error: { code?: string; message?: string }) => void;
}

export interface ExtractPdfResponse {
    text: string;
}

export interface GradeEssayRequest {
    question_text: string;
    student_answer: string;
    rubric?: string;
}

export interface GradeEssayResponse {
    score: number;
    feedback: string;
}

export const aiApi = {
    extractPdf: async (file: File): Promise<ExtractPdfResponse> => {
        const formData = new FormData();
        formData.append('file', file);

        // Use multipart/form-data specifically for this endpoint
        const response = await api.post<ApiSuccess<ExtractPdfResponse>>('/ai/extract-pdf', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data.data;
    },

    generateQuestions: async (data: GenerateQuestionRequest): Promise<GenerateQuestionResponse> => {
        const response = await api.post<ApiSuccess<GenerateQuestionResponse>>('/ai/generate', data);
        return response.data.data;
    },

    generateQuestionsStream: async (
        data: GenerateQuestionRequest,
        handlers?: GenerateStreamHandlers,
    ): Promise<GenerateQuestionResponse> => {
        const token = useAuthStore.getState().accessToken;
        if (!token) {
            throw new Error("Missing auth token");
        }

        const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL).replace(/\/+$/, "");
        const response = await fetch(`${baseUrl}/ai/generate/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok || !response.body) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.error?.message || "Failed to start AI stream");
        }

        const decoder = new TextDecoder("utf-8");
        const reader = response.body.getReader();
        let buffer = "";
        let rawSseText = "";
        let rawStreamText = "";

        const tryParseQuestionsPayload = (text: string): GenerateQuestionResponse | null => {
            const candidates: string[] = [];
            const trimmed = text.trim();
            if (trimmed) candidates.push(trimmed);

            const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fenced?.[1]) candidates.push(fenced[1].trim());

            const firstBrace = trimmed.indexOf("{");
            const lastBrace = trimmed.lastIndexOf("}");
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
            }

            for (const candidate of candidates) {
                try {
                    const parsed = JSON.parse(candidate);
                    if (parsed && Array.isArray(parsed.questions)) {
                        return parsed as GenerateQuestionResponse;
                    }
                    if (parsed?.data && Array.isArray(parsed.data.questions)) {
                        return parsed.data as GenerateQuestionResponse;
                    }
                } catch {
                    // continue to next candidate
                }
            }
            return null;
        };

        const tryExtractFinalFromSse = (text: string): GenerateQuestionResponse | null => {
            const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            const blocks = normalized.split(/\n{2,}/);
            for (const block of blocks) {
                if (!block.trim()) continue;
                let eventName = "";
                const dataLines: string[] = [];
                for (const rawLine of block.split("\n")) {
                    const line = rawLine.replace(/^\uFEFF/, "").trimEnd();
                    if (!line || line.startsWith(":")) continue;
                    if (line.startsWith("event:")) {
                        eventName = line.slice(6).trim();
                        continue;
                    }
                    if (line.startsWith("data:")) {
                        dataLines.push(line.slice(5).trimStart());
                    }
                }

                const payload = tryParseQuestionsPayload(dataLines.join("\n"));
                if (payload && (eventName === "final" || !eventName)) {
                    return payload;
                }
            }
            return null;
        };

        const flushEvent = (eventName: string, rawData: string) => {
            if (!rawData.trim()) return undefined;
            let parsed: any = rawData;
            try {
                parsed = JSON.parse(rawData);
            } catch {
                // keep raw data if not JSON
            }

            if (eventName === "chunk") {
                const text = typeof parsed?.text === "string" ? parsed.text : String(parsed ?? "");
                rawStreamText += text;
                handlers?.onChunk?.(text);
                return undefined;
            }

            if (eventName === "error") {
                handlers?.onError?.(parsed ?? { message: "AI stream failed" });
                throw new Error(parsed?.message || "AI stream failed");
            }

            if (eventName === "final") {
                const direct =
                    parsed && Array.isArray(parsed.questions)
                        ? (parsed as GenerateQuestionResponse)
                        : tryParseQuestionsPayload(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
                return direct ?? undefined;
            }

            return undefined;
        };

        let finalPayload: GenerateQuestionResponse | null = null;
        const processEventBlock = (block: string) => {
            if (!block.trim()) return;
            let eventName = "";
            const dataLines: string[] = [];
            for (const rawLine of block.split("\n")) {
                const line = rawLine.replace(/^\uFEFF/, "").trimEnd();
                if (!line || line.startsWith(":")) continue;
                if (line.startsWith("event:")) {
                    eventName = line.slice(6).trim();
                    continue;
                }
                if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }
            const maybeFinal = flushEvent(eventName, dataLines.join("\n"));
            if (maybeFinal) finalPayload = maybeFinal;
        };

        const processBuffer = () => {
            buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            while (true) {
                const delimiterIndex = buffer.indexOf("\n\n");
                if (delimiterIndex === -1) break;
                const block = buffer.slice(0, delimiterIndex);
                buffer = buffer.slice(delimiterIndex + 2);
                processEventBlock(block);
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (value) {
                const decoded = decoder.decode(value, { stream: !done });
                rawSseText += decoded;
                buffer += decoded;
            }
            if (done) {
                const tail = decoder.decode();
                rawSseText += tail;
                buffer += tail;
                if (buffer.trim()) {
                    buffer += "\n\n";
                }
            }

            processBuffer();

            if (done) {
                break;
            }
        }

        if (!finalPayload) {
            const fallbackSse = tryExtractFinalFromSse(rawSseText);
            if (fallbackSse) {
                return fallbackSse;
            }
            const fallback = tryParseQuestionsPayload(rawStreamText);
            if (fallback) {
                return fallback;
            }
            throw new Error("AI stream completed without final payload");
        }
        return finalPayload;
    },

    gradeEssay: async (data: GradeEssayRequest): Promise<GradeEssayResponse> => {
        const response = await api.post<ApiSuccess<GradeEssayResponse>>('/ai/grade', data);
        return response.data.data;
    },
};
