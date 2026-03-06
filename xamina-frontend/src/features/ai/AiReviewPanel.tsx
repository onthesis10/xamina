import { useState } from 'react';
import { AiGeneratedQuestion } from './ai.api';

interface AiReviewPanelProps {
    questions: AiGeneratedQuestion[];
    onInsert: (selectedQuestions: AiGeneratedQuestion[]) => void;
    onCancel: () => void;
}

export function AiReviewPanel({ questions, onInsert, onCancel }: AiReviewPanelProps) {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
        new Set(questions.map((_, i) => i))
    );

    const toggleSelection = (index: number) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndices(newSet);
    };

    const handleInsert = () => {
        const selected = questions.filter((_, i) => selectedIndices.has(i));
        onInsert(selected);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/95 p-6 text-white overflow-hidden">
            <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col min-h-0 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-800 p-6">
                    <h2 className="text-xl font-bold">Review Generated Questions</h2>
                    <button onClick={onCancel} className="rounded-full p-2 hover:bg-gray-800">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {questions.map((q, idx) => (
                        <div
                            key={idx}
                            className={`rounded-lg border p-5 transition-colors ${selectedIndices.has(idx) ? 'border-blue-500 bg-blue-900/10' : 'border-gray-700 bg-gray-800/50'
                                }`}
                        >
                            <div className="flex items-start gap-4">
                                <input
                                    type="checkbox"
                                    checked={selectedIndices.has(idx)}
                                    onChange={() => toggleSelection(idx)}
                                    className="mt-1 h-5 w-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="bg-gray-700 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300">
                                            {q.question_type.replace('_', ' ')}
                                        </span>
                                    </div>

                                    <p className="text-lg font-medium">{q.question_text}</p>

                                    {q.question_type === 'multiple_choice' && q.options && (
                                        <div className="space-y-2 pl-4 border-l-2 border-gray-700 mt-4">
                                            {q.options.map((opt, oIdx) => (
                                                <div key={oIdx} className="flex items-center gap-2">
                                                    <div className={`w-4 h-4 rounded-full border ${opt.is_correct ? 'border-green-500 bg-green-500' : 'border-gray-500'}`} />
                                                    <span className={opt.is_correct ? 'text-green-400 font-medium' : 'text-gray-300'}>
                                                        {String.fromCharCode(65 + oIdx)}. {opt.text}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {q.question_type === 'true_false' && (
                                        <div className="mt-4 pl-4 border-l-2 border-gray-700">
                                            <p className="text-gray-300">
                                                Answer: <span className={q.correct_answer_bool ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                                    {q.correct_answer_bool ? 'True' : 'False'}
                                                </span>
                                            </p>
                                        </div>
                                    )}

                                    <div className="mt-4 rounded bg-gray-800/80 p-3 text-sm text-gray-400 italic">
                                        <span className="font-semibold text-gray-300 block mb-1">Explanation / Rubric:</span>
                                        {q.explanation}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {questions.length === 0 && (
                        <div className="text-center text-gray-500 py-12">
                            No questions generated.
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-800 bg-gray-900 p-6">
                    <div className="text-sm text-gray-400">
                        Selected <span className="font-bold text-white">{selectedIndices.size}</span> of <span className="font-bold text-white">{questions.length}</span> questions
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800"
                        >
                            Discard All
                        </button>
                        <button
                            onClick={handleInsert}
                            disabled={selectedIndices.size === 0}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            Add to Bank Soal
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
