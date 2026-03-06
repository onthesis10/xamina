interface StatusBadgeProps {
  value: "draft" | "published" | "active" | "inactive" | "in_progress" | "finished" | "auto_finished";
}

export function StatusBadge({ value }: StatusBadgeProps) {
  return <span className={`status-badge status-${value}`}>{value}</span>;
}
