import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { api, errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { ApiSuccess, ClassDto, CreateClassDto, UpdateClassDto } from "@/types/api.types";

export function ClassesPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<CreateClassDto>({ name: "", grade: "", major: "" });
  const [editingClass, setEditingClass] = useState<ClassDto | null>(null);
  const [deletingClass, setDeletingClass] = useState<ClassDto | null>(null);

  const classQuery = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const response = await api.get<ApiSuccess<ClassDto[]>>("/classes");
      return response.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/classes", {
        name: form.name,
        grade: form.grade || undefined,
        major: form.major || undefined,
      });
    },
    onSuccess: async () => {
      setForm({ name: "", grade: "", major: "" });
      await qc.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Kelas berhasil ditambahkan.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal membuat kelas."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: UpdateClassDto }) => {
      await api.patch(`/classes/${payload.id}`, payload.data);
    },
    onSuccess: async () => {
      setEditingClass(null);
      await qc.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Kelas berhasil diupdate.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, { CLASS_IN_USE: "Kelas masih digunakan user aktif." }, "Gagal update kelas."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/classes/${id}`);
    },
    onSuccess: async () => {
      setDeletingClass(null);
      await qc.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Kelas berhasil dihapus.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, { CLASS_IN_USE: "Kelas masih dipakai user, tidak bisa dihapus." }, "Gagal hapus kelas."));
    },
  });

  return (
    <section className="panel-grid">
      <section className="card">
        <h3 className="section-title">Tambah Kelas</h3>
        <div className="grid-3">
          <input className="input" value={form.name} placeholder="name" onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
          <input className="input" value={form.grade} placeholder="grade" onChange={(e) => setForm((v) => ({ ...v, grade: e.target.value }))} />
          <input className="input" value={form.major} placeholder="major" onChange={(e) => setForm((v) => ({ ...v, major: e.target.value }))} />
        </div>
        <button className="btn" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Simpan Kelas</button>
      </section>

      <DataTable
        title="Daftar Kelas"
        rows={classQuery.data ?? []}
        loading={classQuery.isLoading}
        error={classQuery.isError ? errorMessageForCode(classQuery.error, {}, "Gagal mengambil data kelas.") : null}
        columns={[
          { key: "name", header: "Name", render: (c) => c.name },
          { key: "grade", header: "Grade", render: (c) => c.grade ?? "-" },
          { key: "major", header: "Major", render: (c) => c.major ?? "-" },
          { key: "status", header: "Status", render: (c) => <StatusBadge value={c.is_active ? "active" : "inactive"} /> },
          {
            key: "action",
            header: "Action",
            render: (c) => (
              <div className="row gap-sm">
                <button className="btn btn-ghost" onClick={() => setEditingClass(c)}>Edit</button>
                <button className="btn btn-ghost" onClick={() => {
                  updateMutation.mutate({
                    id: c.id,
                    data: { is_active: !c.is_active },
                  });
                }}>
                  {c.is_active ? "Deactivate" : "Activate"}
                </button>
                <button className="btn btn-ghost" onClick={() => setDeletingClass(c)}>Delete</button>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!editingClass}
        title="Edit kelas"
        confirmLabel={updateMutation.isPending ? "Saving..." : "Simpan"}
        onCancel={() => setEditingClass(null)}
        onConfirm={() => {
          if (!editingClass) return;
          updateMutation.mutate({
            id: editingClass.id,
            data: {
              name: editingClass.name,
              grade: editingClass.grade ?? undefined,
              major: editingClass.major ?? undefined,
              is_active: editingClass.is_active,
            },
          });
        }}
      >
        {editingClass ? (
          <div className="panel-grid" style={{ marginTop: 8 }}>
            <input className="input" value={editingClass.name} onChange={(e) => setEditingClass((v) => (v ? { ...v, name: e.target.value } : v))} />
            <input className="input" value={editingClass.grade ?? ""} onChange={(e) => setEditingClass((v) => (v ? { ...v, grade: e.target.value || null } : v))} />
            <input className="input" value={editingClass.major ?? ""} onChange={(e) => setEditingClass((v) => (v ? { ...v, major: e.target.value || null } : v))} />
            <select className="input" value={String(editingClass.is_active)} onChange={(e) => setEditingClass((v) => (v ? { ...v, is_active: e.target.value === "true" } : v))}>
              <option value="true">active</option>
              <option value="false">inactive</option>
            </select>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deletingClass}
        title="Hapus kelas?"
        description={`Kelas ${deletingClass?.name ?? ""} akan dihapus.`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Hapus"}
        onCancel={() => setDeletingClass(null)}
        onConfirm={() => {
          if (!deletingClass) return;
          deleteMutation.mutate(deletingClass.id);
        }}
      />
    </section>
  );
}
