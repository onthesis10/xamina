import { ChangeEvent, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { QuestionImportFormat, QuestionImportPreviewResponse } from "@/types/api.types";

import { questionApi } from "./question.api";

interface QuestionImportWizardProps {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

export function QuestionImportWizard({ open, onClose, onImported }: QuestionImportWizardProps) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QuestionImportPreviewResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: (selectedFile: File) => questionApi.previewImport(selectedFile),
    onMutate: () => setErrorText(null),
    onSuccess: (result) => {
      setPreview(result);
      toast.success("Preview import berhasil diproses.");
    },
    onError: (error) => {
      const message = errorMessageForCode(
        error,
        {
          VALIDATION_ERROR: "File import tidak valid atau tidak sesuai template.",
          RATE_LIMITED: "Preview import sedang dibatasi. Coba lagi sebentar.",
          FORBIDDEN: "Role ini tidak diizinkan mengimpor soal.",
        },
        "Gagal memproses preview import.",
      );
      setErrorText(message);
      toast.error(message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!preview) {
        throw new Error("Preview import belum tersedia.");
      }
      return questionApi.commitImport(preview.questions);
    },
    onMutate: () => setErrorText(null),
    onSuccess: async (result) => {
      toast.success(`${result.inserted_count} soal berhasil diimport.`);
      setPreview(null);
      setFile(null);
      await onImported();
      onClose();
    },
    onError: (error) => {
      const message = errorMessageForCode(
        error,
        {
          VALIDATION_ERROR: "Data hasil preview tidak valid untuk di-commit.",
          RATE_LIMITED: "Commit import sedang dibatasi. Coba lagi sebentar.",
          FORBIDDEN: "Role ini tidak diizinkan commit import soal.",
        },
        "Gagal commit import soal.",
      );
      setErrorText(message);
      toast.error(message);
    },
  });

  const formatLabel = useMemo(() => {
    if (!file) return "Belum ada file";
    return file.name.toLowerCase().endsWith(".docx") ? "DOCX terstruktur" : "XLSX template";
  }, [file]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setErrorText(null);
  };

  const downloadTemplate = async (format: QuestionImportFormat) => {
    try {
      const blob = await questionApi.downloadImportTemplate(format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `xamina-question-import-template.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessageForCode(error, {}, "Gagal mengunduh template import."));
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog-card question-import-dialog">
        <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 className="section-title">Import Soal</h3>
            <p className="state-text">Flow: upload file → preview valid/error rows → commit.</p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Tutup
          </button>
        </div>

        <section className="import-contract">
          <p className="state-text">Kontrak template terstruktur:</p>
          <ul className="tour-list">
            <li>XLSX wajib memakai header resmi: `type`, `content`, `option_a..option_d`, `answer_key`, `topic`, `difficulty`, `is_active`, `image_url`.</li>
            <li>DOCX wajib memakai blok `Key: Value` per soal, dipisahkan baris kosong.</li>
            <li>`answer_key` untuk multiple choice harus memakai id opsi seperti `A`, `B`, `C`, `D`.</li>
          </ul>
          <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => downloadTemplate("xlsx")}>
              Download Template XLSX
            </button>
            <button className="btn btn-ghost" onClick={() => downloadTemplate("docx")}>
              Download Template DOCX
            </button>
          </div>
        </section>

        <div className="panel-grid">
          <label className="form-field">
            <span className="form-label">File Import</span>
            <input
              className="input"
              type="file"
              accept=".xlsx,.docx"
              onChange={onFileChange}
            />
          </label>
          <p className="state-text">Format terdeteksi: {formatLabel}</p>
          {errorText ? <p className="state-text error">{errorText}</p> : null}
          <div className="row gap-sm">
            <button
              className="btn"
              onClick={() => file && previewMutation.mutate(file)}
              disabled={!file || previewMutation.isPending}
            >
              {previewMutation.isPending ? "Memproses Preview..." : "Preview Import"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setErrorText(null);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {preview ? (
          <section className="panel-grid import-preview-panel">
            <div className="row gap-sm" style={{ flexWrap: "wrap" }}>
              <span className="pill p-green">Valid: {preview.valid_rows}</span>
              <span className="pill p-rose">Invalid: {preview.invalid_rows}</span>
              <span className="pill p-neu">Total: {preview.total_rows}</span>
              <span className="pill p-neu">Format: {preview.format.toUpperCase()}</span>
            </div>

            <div className="import-preview-grid">
              <section className="card" style={{ boxShadow: "none" }}>
                <h4>Valid Rows</h4>
                {preview.questions.length === 0 ? (
                  <p className="state-text">Belum ada row valid.</p>
                ) : (
                  <div className="import-preview-list">
                    {preview.questions.map((item) => (
                      <article key={`${item.row_no}-${item.question.content}`} className="import-preview-item">
                        <strong>Row {item.row_no}</strong>
                        <p>{item.question.content}</p>
                        <small className="state-text">
                          {item.question.type} | {item.question.topic || "-"} | {item.question.difficulty || "-"}
                        </small>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="card" style={{ boxShadow: "none" }}>
                <h4>Row Errors</h4>
                {preview.errors.length === 0 ? (
                  <p className="state-text">Tidak ada row invalid.</p>
                ) : (
                  <div className="import-preview-list">
                    {preview.errors.map((item) => (
                      <article key={`${item.row_no}-${item.message}`} className="import-preview-item error">
                        <strong>Row {item.row_no}</strong>
                        <p>{item.message}</p>
                        <small className="state-text">{item.code}</small>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="row gap-sm">
              <button
                className="btn"
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending || preview.questions.length === 0}
              >
                {commitMutation.isPending ? "Commit Import..." : "Commit Valid Rows"}
              </button>
              <button className="btn btn-ghost" onClick={onClose}>
                Nanti Saja
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
