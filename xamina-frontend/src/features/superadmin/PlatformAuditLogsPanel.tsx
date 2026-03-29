import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { errorMessageForCode } from "@/lib/axios";
import type { PlatformAuditLogDto } from "@/types/api.types";

import { platformApi } from "./platform.api";

export function PlatformAuditLogsPanel() {
  const [page, setPage] = useState(1);
  const [searchAction, setSearchAction] = useState("");
  const [targetType, setTargetType] = useState("");

  const logsQuery = useQuery({
    queryKey: ["platform-audit-logs", page, searchAction, targetType],
    queryFn: () =>
      platformApi.listAuditLogs({
        page,
        page_size: 20,
        action: searchAction || undefined,
        target_type: targetType || undefined,
      }),
  });

  const rows = useMemo(
    () =>
      (logsQuery.data?.data ?? []).map((row) => ({
        ...row,
        id: row.id,
      })),
    [logsQuery.data?.data],
  );
  const meta = logsQuery.data?.meta;

  return (
    <section className="panel-grid">
      <section className="card">
        <p className="section-eyebrow">Platform Audit</p>
        <h2 className="section-title">Audit Log Viewer</h2>
        <p className="state-text">
          Pantau perubahan kritikal platform (tenant, billing platform, dan AI config) berbasis
          event audit yang immutable.
        </p>
      </section>

      <DataTable
        title="Platform Audit Logs"
        loading={logsQuery.isLoading}
        error={logsQuery.isError ? errorMessageForCode(logsQuery.error, {}, "Gagal memuat audit logs.") : null}
        rows={rows}
        columns={[
          {
            key: "time",
            header: "Waktu",
            render: (row: PlatformAuditLogDto) =>
              new Date(row.created_at).toLocaleString("id-ID", {
                dateStyle: "short",
                timeStyle: "medium",
              }),
          },
          {
            key: "actor",
            header: "Actor",
            render: (row: PlatformAuditLogDto) => (
              <div className="stack gap-xs">
                <strong>{row.actor_name ?? row.actor_user_id ?? "unknown"}</strong>
                <span className="state-text text-mono">{row.actor_role}</span>
              </div>
            ),
          },
          { key: "action", header: "Action", render: (row: PlatformAuditLogDto) => <code>{row.action}</code> },
          { key: "target_type", header: "Target", render: (row: PlatformAuditLogDto) => row.target_type },
          {
            key: "tenant",
            header: "Tenant",
            render: (row: PlatformAuditLogDto) => row.tenant_id ?? "-",
          },
          {
            key: "metadata",
            header: "Metadata",
            render: (row: PlatformAuditLogDto) => (
              <details>
                <summary>Lihat</summary>
                <pre className="state-text text-mono" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                  {JSON.stringify(row.metadata_jsonb, null, 2)}
                </pre>
              </details>
            ),
          },
        ]}
        actions={
          <div className="inline-actions">
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Filter action (contains)"
              value={searchAction}
              onChange={(e) => {
                setPage(1);
                setSearchAction(e.target.value);
              }}
            />
            <input
              className="input"
              style={{ maxWidth: 220 }}
              placeholder="target_type (exact)"
              value={targetType}
              onChange={(e) => {
                setPage(1);
                setTargetType(e.target.value);
              }}
            />
            <button className="btn btn-ghost" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
              Prev
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setPage((value) => value + 1)}
              disabled={!meta || meta.page * meta.page_size >= meta.total}
            >
              Next
            </button>
          </div>
        }
      />
    </section>
  );
}
