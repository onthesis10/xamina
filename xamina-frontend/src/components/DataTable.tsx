import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingSkeleton } from "./LoadingSkeleton";

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
    <motion.section 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden glass border-white/10 shadow-lg"
    >
      {title ? (
        <div className="px-6 py-5 border-b border-white/10 bg-white/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-soft mb-1">Data Explorer</p>
          <h3 className="text-xl font-bold text-text-0">{title}</h3>
        </div>
      ) : null}
      
      {actions ? <div className="p-4 bg-white/5 border-b border-white/10">{actions}</div> : null}
      
      <div className="table-wrap overflow-x-auto max-h-[600px]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-bg-1/95 backdrop-blur-xl shadow-md">
            <tr>
              {onToggleSelect ? <th className="p-4 text-left w-12 border-b border-white/10" /> : null}
              {columns.map((col) => (
                <th key={col.key} className="p-4 text-left text-[10px] font-bold uppercase tracking-wider text-text-3 border-b border-white/10">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <AnimatePresence>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <motion.tr 
                    key={`skeleton-${index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-white/2"
                  >
                    {onToggleSelect ? <td className="p-4" /> : null}
                    <td colSpan={columns.length} className="p-4">
                      <LoadingSkeleton lines={1} />
                    </td>
                  </motion.tr>
                ))
              ) : rows.length === 0 ? (
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                   <td colSpan={columns.length + (onToggleSelect ? 1 : 0)} className="p-16 text-center">
                      <div className="flex flex-col items-center gap-3 py-10 opacity-60">
                        <div className="text-5xl mb-2">🧊</div>
                        <p className="text-text-2 font-medium tracking-wide italic">{emptyLabel}</p>
                      </div>
                   </td>
                </motion.tr>
              ) : (
                rows.map((row, idx) => (
                  <motion.tr 
                    key={row.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                    className="group hover:bg-white/5 transition-all duration-200 cursor-default odd:bg-white/[0.02]"
                  >
                    {onToggleSelect ? (
                      <td className="p-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded-sm border-white/20 bg-white/5 text-violet-soft focus:ring-violet-soft focus:ring-offset-bg-1 transition-all"
                          checked={selectedIds?.includes(row.id) ?? false}
                          onChange={(e) => onToggleSelect(row.id, e.target.checked)}
                          aria-label={`Select row ${row.id}`}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td key={`${row.id}-${col.key}`} className="p-4 text-sm text-text-1 group-hover:text-text-0 transition-colors">
                        {col.render(row)}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      
      {error ? (
        <div className="p-4 bg-danger/10 border-t border-danger/20">
          <p className="text-danger text-xs font-semibold flex items-center gap-2">
            <span className="text-lg">⚠️</span> {error}
          </p>
        </div>
      ) : null}
      
      {!loading && !error && rows.length > 0 && (
        <div className="p-4 bg-white/5 border-t border-white/10 text-[10px] font-bold text-text-3 uppercase tracking-widest text-right">
          Total: {rows.length} Entries
        </div>
      )}
    </motion.section>
  );
}
