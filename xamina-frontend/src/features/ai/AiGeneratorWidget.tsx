import { ChangeEvent, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { FormField } from "@/components/FormField";
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
    onError: (error) => {
      setStreamError(errorMessage(error));
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
    onError: (error) => {
      setStreamError(errorMessage(error));
    },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setPdfFile(event.target.files[0]);
    }
  };

  const handleExtractContext = () => {
    if (pdfFile) {
      extractMutation.mutate(pdfFile);
    }
  };

  const handleGenerate = () => {
    if (!topic.trim()) {
      setStreamError("Topik wajib diisi.");
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
    <div className="modal-backdrop">
      <section className="modal-panel card" style={{ padding: 24 }}>
        <div className="modal-header">
          <div>
            <p className="section-eyebrow">AI Workspace</p>
            <h2 className="section-title">AI Question Generator</h2>
            <p className="state-text">Buat soal baru, ekstrak konteks PDF, dan pantau hasil streaming secara live.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <FormField label="Topic">
            <input
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Misal: Photosynthesis, Newton's Laws"
              className="input"
            />
          </FormField>

          <div className="grid-3">
            <FormField label="Type">
              <select value={questionType} onChange={(event) => setQuestionType(event.target.value)} className="input">
                <option value="multiple_choice">Multiple Choice</option>
                <option value="true_false">True / False</option>
                <option value="essay">Essay</option>
              </select>
            </FormField>

            <FormField label="Difficulty">
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="input">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </FormField>

            <FormField label="Count">
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(event) => setCount(parseInt(event.target.value || "1", 10))}
                className="input"
              />
            </FormField>
          </div>

          <div className="surface-muted">
            <div className="panel-header">
              <div>
                <p className="section-eyebrow">PDF Context</p>
                <h3 className="section-title-sm">Ekstraksi Konteks</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleExtractContext}
                disabled={!pdfFile || extractMutation.isPending}
              >
                {extractMutation.isPending ? "Extracting..." : "Extract Text"}
              </button>
            </div>
            <div className="stack gap-sm">
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="input" />
              <p className="state-text">{pdfFile ? `Selected file: ${pdfFile.name}` : "Belum ada PDF dipilih."}</p>
            </div>
          </div>

          <FormField label="Context Text" hint={context ? `Context length: ${context.length} chars` : undefined}>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Paste custom context here, or extract from PDF above..."
              rows={5}
              className="textarea"
            />
          </FormField>

          <FormField label="Live Stream Preview">
            <textarea
              readOnly
              value={streamPreview}
              rows={8}
              className="textarea"
              placeholder="Streaming output will appear here..."
            />
          </FormField>

          {streamError ? <p className="state-text error">{streamError}</p> : null}
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={handleGenerate} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? "Streaming..." : "Generate Questions"}
          </button>
        </div>
      </section>
    </div>
  );
}
