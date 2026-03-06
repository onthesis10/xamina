import { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {children}
      {hint ? <small className="form-hint">{hint}</small> : null}
      {error ? <small className="form-error">{error}</small> : null}
    </label>
  );
}
