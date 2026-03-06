import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { certificateApi } from "@/features/analytics/analytics.api";
import { errorMessageForCode } from "@/lib/axios";
import type { CertificateDto } from "@/types/api.types";

export function MyCertificatesPanel() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CertificateDto | null>(null);

  const certQuery = useQuery({
    queryKey: ["my-certificates", page],
    queryFn: () => certificateApi.listMine({ page, page_size: 10 }),
  });

  const rows = useMemo(() => certQuery.data?.data ?? [], [certQuery.data]);
  const totalPage = Math.max(
    1,
    Math.ceil((certQuery.data?.meta.total ?? 0) / (certQuery.data?.meta.page_size ?? 10)),
  );

  return (
    <section className="panel-grid">
      <section className="card">
        <h3 className="section-title">Sertifikat Saya</h3>
        <p className="state-text">Pilih sertifikat untuk preview atau download.</p>
      </section>

      <DataTable
        title="Daftar Sertifikat"
        rows={rows}
        loading={certQuery.isLoading}
        error={
          certQuery.isError
            ? errorMessageForCode(certQuery.error, {}, "Gagal memuat sertifikat.")
            : null
        }
        emptyLabel="Belum ada sertifikat."
        actions={
          <span className="row gap-sm">
            <button
              className="btn btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((v) => Math.max(1, v - 1))}
            >
              Prev
            </button>
            <span className="state-text">Page {page}/{totalPage}</span>
            <button
              className="btn btn-ghost"
              disabled={page >= totalPage}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </button>
          </span>
        }
        columns={[
          { key: "certificate_no", header: "No", render: (row: CertificateDto) => row.certificate_no },
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
                <a
                  className="btn btn-ghost"
                  href={certificateApi.downloadUrl(row.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
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
          <object
            data={selected.file_url}
            type="application/pdf"
            width="100%"
            height="640"
            aria-label="Certificate preview"
          >
            <p className="state-text">
              Browser tidak mendukung preview PDF.{" "}
              <a href={certificateApi.downloadUrl(selected.id)} target="_blank" rel="noreferrer">
                Klik untuk download
              </a>
              .
            </p>
          </object>
        </section>
      ) : null}
    </section>
  );
}
