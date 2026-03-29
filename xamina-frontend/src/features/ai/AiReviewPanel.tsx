import { useState } from "react";

import type { AiGeneratedQuestion } from "./ai.api";

interface AiReviewPanelProps {
  questions: AiGeneratedQuestion[];
  onInsert: (selectedQuestions: AiGeneratedQuestion[]) => void;
  onCancel: () => void;
}

export function AiReviewPanel({ questions, onInsert, onCancel }: AiReviewPanelProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set(questions.map((_, index) => index)));

  const toggleSelection = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const handleInsert = () => {
    const selected = questions.filter((_, index) => selectedIndices.has(index));
    onInsert(selected);
  };

  return (
    <div className="modal-backdrop">
      <section className="modal-panel card" style={{ padding: 24, width: "min(1120px, calc(100vw - 32px))" }}>
        <div className="modal-header">
          <div>
            <p className="section-eyebrow">AI Review</p>
            <h2 className="section-title">Review Generated Questions</h2>
            <p className="state-text">Pilih soal yang lolos review sebelum dimasukkan ke bank soal.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Close
          </button>
        </div>

        <div className="stack" style={{ maxHeight: "62vh", overflowY: "auto" }}>
          {questions.map((question, index) => (
            <article
              key={`${question.question_text}-${index}`}
              className="card"
              style={{
                borderColor: selectedIndices.has(index) ? "var(--primary-border)" : undefined,
                background: selectedIndices.has(index) ? "var(--primary-bg)" : undefined,
              }}
            >
              <div className="row gap-sm items-start">
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={selectedIndices.has(index)}
                  onChange={() => toggleSelection(index)}
                />

                <div className="stack gap-sm" style={{ flex: 1 }}>
                  <div className="inline-actions">
                    <span className="pill p-neu">{question.question_type.replace("_", " ")}</span>
                  </div>

                  <p className="text-lg font-medium" style={{ margin: 0 }}>
                    {question.question_text}
                  </p>

                  {question.question_type === "multiple_choice" && question.options ? (
                    <div className="surface-muted">
                      <div className="stack gap-xs">
                        {question.options.map((option, optionIndex) => (
                          <div key={`${option.text}-${optionIndex}`} className="row gap-sm">
                            <span className={`pill ${option.is_correct ? "p-green" : "p-neu"}`}>
                              {String.fromCharCode(65 + optionIndex)}
                            </span>
                            <span>{option.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {question.question_type === "true_false" ? (
                    <div className="surface-muted">
                      <p className="state-text">
                        Answer:
                        {" "}
                        <strong>{question.correct_answer_bool ? "True" : "False"}</strong>
                      </p>
                    </div>
                  ) : null}

                  <div className="surface-muted">
                    <p className="section-eyebrow">Explanation / Rubric</p>
                    <p className="state-text">{question.explanation}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {questions.length === 0 ? <p className="state-text text-center">No questions generated.</p> : null}
        </div>

        <div className="modal-actions" style={{ marginTop: 20, justifyContent: "space-between" }}>
          <p className="state-text">
            Selected <strong>{selectedIndices.size}</strong> of <strong>{questions.length}</strong> questions
          </p>
          <div className="inline-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Discard All
            </button>
            <button type="button" className="btn" onClick={handleInsert} disabled={selectedIndices.size === 0}>
              Add to Bank Soal
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
