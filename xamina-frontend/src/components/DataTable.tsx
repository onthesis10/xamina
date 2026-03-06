import { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T extends { id: string }> {
  title?: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  selectedIds?: string[];
  onToggleSelect?: (id: string, checked: boolean) => void;
  actions?: ReactNode;
  emptyLabel?: string;
}

export function DataTable<T extends { id: string }>(props: DataTableProps<T>) {
  const {
    title,
    columns,
    rows,
    loading,
    error,
    selectedIds,
    onToggleSelect,
    actions,
    emptyLabel = "No data",
  } = props;

  return (
    <section className="card">
      {title ? <h3 className="section-title">{title}</h3> : null}
      {actions ? <div className="table-actions">{actions}</div> : null}
      <div className="table-wrap">
        <table className="x-table">
          <thead>
            <tr>
              {onToggleSelect ? <th className="checkbox-cell" /> : null}
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {onToggleSelect ? (
                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={selectedIds?.includes(row.id) ?? false}
                      onChange={(e) => onToggleSelect(row.id, e.target.checked)}
                      aria-label={`Select row ${row.id}`}
                    />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td key={`${row.id}-${col.key}`}>{col.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading ? <p className="state-text">Loading...</p> : null}
      {error ? <p className="state-text error">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? <p className="state-text">{emptyLabel}</p> : null}
    </section>
  );
}
