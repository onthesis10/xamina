import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { certificateApi } from "@/features/analytics/analytics.api";
import { errorMessageForCode } from "@/lib/axios";
import { downloadPublicAssetFile, saveBlobAsFile } from "@/lib/file-download";
import { useToast } from "@/store/toast.store";
import type { CertificateDto } from "@/types/api.types";

export function MyCertificatesPanel() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CertificateDto | null>(null);

  const certQuery = useQuery({
    queryKey: ["my-certificates", page],
    queryFn: () => certificateApi.listMine({ page, page_size: 10 }),
  });

  const rows = useMemo(() => certQuery.data?.data ?? [], [certQuery.data]);
  const totalPage = Math.max(1, Math.ceil((certQuery.data?.meta.total ?? 0) / (certQuery.data?.meta.page_size ?? 10)));

  const downloadMutation = useMutation({
    mutationFn: async (certificate: CertificateDto) => {
      const primary = await certificateApi.downloadPdf(certificate.id).catch(() => null);
      if (primary instanceof Blob && primary.size > 0) {
        saveBlobAsFile(primary, `xamina-certificate-${certificate.certificate_no}.pdf`);
        return;
      }

      const fallback = await downloadPublicAssetFile(certificate.file_url, {
        expectedContentTypes: ["pdf", "octet-stream"],
        fallbackMimeType: "application/pdf",
      });
      if (fallback instanceof Blob && fallback.size > 0) {
        saveBlobAsFile(fallback, `xamina-certificate-${certificate.certificate_no}.pdf`);
        return;
      }

      throw new Error("Certificate download failed");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal mengunduh sertifikat."));
    },
  });

  return (
    <section className="panel-grid">
      <section className="page-hero card">
        <div className="page-hero-copy">
          <p className="section-eyebrow">Certificates</p>
          <h3 className="section-title">Preview dan unduh sertifikat dari satu galeri yang rapi</h3>
          <h4 className="section-title-sm">Sertifikat Saya</h4>
          <p className="section-desc">
            Siswa bisa meninjau dokumen yang sudah terbit tanpa kehilangan konteks nilai dan waktu penerbitannya.
          </p>
        </div>
        <div className="metric-grid mixed">
          <section className="card stat-card card-muted">
            <p className="stat-label">Issued Certificates</p>
            <h3 className="metric-value">{certQuery.data?.meta.total ?? rows.length}</h3>
            <p className="stat-trend">Semua sertifikat yang tersedia untuk akun aktif.</p>
          </section>
        </div>
      </section>

      <DataTable
        title="Daftar Sertifikat"
        rows={rows}
        loading={certQuery.isLoading}
        error={certQuery.isError ? errorMessageForCode(certQuery.error, {}, "Gagal memuat sertifikat.") : null}
        emptyLabel="Belum ada sertifikat."
        actions={
          <span className="row gap-sm">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Prev
            </button>
            <span className="state-text">
              Page {page}/{totalPage}
            </span>
            <button className="btn btn-ghost" disabled={page >= totalPage} onClick={() => setPage((value) => value + 1)}>
              Next
            </button>
          </span>
        }
        columns={[
          { key: "certificate_no", header: "No", render: (row: CertificateDto) => <span className="text-mono">{row.certificate_no}</span> },
          { key: "score", header: "Score", render: (row: CertificateDto) => row.score.toFixed(2) },
          {
            key: "issued_at",
            header: "Issued",
            render: (row: CertificateDto) => new Date(row.issued_at).toLocaleString(),
          },
          {
            key: "action",
            header: "Action",
            render: (row: CertificateDto) => (
              <span className="row gap-sm">
                <button className="btn btn-ghost" onClick={() => setSelected(row)}>
                  Preview
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => downloadMutation.mutate(row)}
                  disabled={downloadMutation.isPending}
                >
                  Download
                </button>
              </span>
            ),
          },
        ]}
      />

      {selected ? (
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 className="section-title">Preview Sertifikat</h3>
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <object data={selected.file_url} type="application/pdf" width="100%" height="640" aria-label="Certificate preview">
            <p className="state-text">
              Browser tidak mendukung preview PDF.{" "}
              <button
                className="btn btn-ghost"
                onClick={() => downloadMutation.mutate(selected)}
                disabled={downloadMutation.isPending}
              >
                Klik untuk download
              </button>
              .
            </p>
          </object>
        </section>
      ) : null}
    </section>
  );
}
