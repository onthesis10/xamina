import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Building2, Save, Loader2 } from "lucide-react";
import { tenantApi } from "@/features/superadmin/tenant.api";
import { useAuthStore } from "@/store/auth.store";

interface TenantSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TenantSettingsDialog({ open, onClose }: TenantSettingsDialogProps) {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.tenant_name || "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newName: string) => tenantApi.updateMe({ name: newName }),
    onSuccess: () => {
      if (user) {
        setUser({ ...user, tenant_name: name });
      }
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      alert("School name updated successfully");
      onClose();
    },
    onError: () => {
      alert("Failed to update school name");
    },
  });

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">School Settings</h2>
              <p className="text-xs text-muted">Update your institution details</p>
            </div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="p-6 space-y-4">
          <div className="form-group">
            <label className="form-label">School / Tenant Name</label>
            <div className="relative">
              <input
                type="text"
                className="form-input pl-10"
                placeholder="Enter school name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <p className="text-[10px] text-muted mt-1.5">
              This name will be displayed in the greetings and reports.
            </p>
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => mutation.mutate(name)}
            disabled={mutation.isPending || !name.trim() || name === user?.tenant_name}
          >
            {mutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            <span>Save Changes</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
