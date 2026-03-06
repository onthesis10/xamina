import { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  children,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog-card">
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
        {children}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
