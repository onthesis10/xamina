import { ChangeEvent, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { normalizeApiError } from "@/lib/axios";

import { aiApi, GenerateQuestionRequest } from "./ai.api";

interface AiGeneratorWidgetProps {
    onQuestionsGenerated: (questions: any[]) => void;
    onClose: () => void;
}

function errorMessage(error: unknown): string {
    const normalized = normalizeApiError(error);
    if (normalized.code === "RATE_LIMITED" || normalized.status === 429) {
        return "Rate limit AI tercapai. Tunggu sebentar lalu coba lagi.";
    }
    return normalized.message || "Failed to generate questions.";
}

export function AiGeneratorWidget({ onQuestionsGenerated, onClose }: AiGeneratorWidgetProps) {
    const [topic, setTopic] = useState("");
    const [context, setContext] = useState("");
    const [questionType, setQuestionType] = useState("multiple_choice");
    const [difficulty, setDifficulty] = useState("medium");
    const [count, setCount] = useState(5);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [streamPreview, setStreamPreview] = useState("");
    const [streamError, setStreamError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const extractMutation = useMutation({
        mutationFn: aiApi.extractPdf,
        onSuccess: (data) => {
            setContext(data.text);
        },
        onError: (err) => {
            console.error("Failed to extract PDF", err);
            alert(errorMessage(err));
        },
    });

    const generateMutation = useMutation({
        mutationFn: async (payload: GenerateQuestionRequest) => {
            setStreamPreview("");
            setStreamError(null);
            return aiApi.generateQuestionsStream(payload, {
                onChunk: (chunk) => {
                    setStreamPreview((old) => `${old}${chunk}`);
                },
                onError: (errorPayload) => {
                    if (errorPayload?.message) {
                        setStreamError(errorPayload.message);
                    }
                },
            });
        },
        onSuccess: (data) => {
            onQuestionsGenerated(data.questions);
        },
        onError: (err) => {
            console.error("Failed to generate questions", err);
            const msg = errorMessage(err);
            setStreamError(msg);
            alert(msg);
        },
    });

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPdfFile(e.target.files[0]);
        }
    };

    const handleExtractContext = () => {
        if (pdfFile) {
            extractMutation.mutate(pdfFile);
        }
    };

    const handleGenerate = () => {
        if (!topic.trim()) {
            alert("Please enter a topic");
            return;
        }

        const payload: GenerateQuestionRequest = {
            topic,
            context: context.trim() || undefined,
            question_type: questionType,
            difficulty,
            count,
        };

        generateMutation.mutate(payload);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-gray-800 bg-gray-900 p-6 text-white shadow-2xl">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-bold">AI Question Generator</h2>
                    <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-800">
                        x
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Topic</label>
                        <input
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g. Photosynthesis, Newton's Laws"
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">Type</label>
                            <select
                                value={questionType}
                                onChange={(e) => setQuestionType(e.target.value)}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="multiple_choice">Multiple Choice</option>
                                <option value="true_false">True / False</option>
                                <option value="essay">Essay</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">Difficulty</label>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value)}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">Count</label>
                            <input
                                type="number"
                                min={1}
                                max={20}
                                value={count}
                                onChange={(e) => setCount(parseInt(e.target.value || "1", 10))}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">PDF Context (Optional)</label>
                        <div className="flex gap-2">
                            <input
                                type="file"
                                accept="application/pdf"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700"
                            />
                            <button
                                onClick={handleExtractContext}
                                disabled={!pdfFile || extractMutation.isPending}
                                className="inline-flex min-w-max items-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
                            >
                                {extractMutation.isPending ? "Extracting..." : "Extract Text"}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Context Text</label>
                        <textarea
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Paste custom context here, or extract from PDF above..."
                            rows={4}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 p-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {context && (
                            <p className="mt-1 text-xs text-gray-500">Context length: {context.length} chars</p>
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Live Stream Preview</label>
                        <textarea
                            readOnly
                            value={streamPreview}
                            rows={6}
                            className="w-full rounded-lg border border-gray-700 bg-black/30 p-2.5 text-xs text-gray-200"
                            placeholder="Streaming output will appear here..."
                        />
                        {streamError ? <p className="mt-2 text-sm text-red-400">{streamError}</p> : null}
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generateMutation.isPending}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {generateMutation.isPending ? "Streaming..." : "Generate Questions"}
                    </button>
                </div>
            </div>
        </div>
    );
}
