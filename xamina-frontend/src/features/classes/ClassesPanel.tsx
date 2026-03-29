import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
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
      <section className="page-hero card">
        <div className="page-hero-copy">
          <p className="section-eyebrow">Class Registry</p>
          <h2 className="section-title">Susun struktur kelas yang bersih untuk semua alur admin dan siswa</h2>
          <p className="section-desc">Data kelas dipakai lintas user assignment, exam targeting, dan laporan. Karena itu tampilan dan aksi utamanya dibuat sejelas mungkin.</p>
        </div>
        <div className="metric-grid mixed">
          <section className="card stat-card card-muted">
            <p className="stat-label">Total Kelas</p>
            <h3 className="metric-value">{classQuery.data?.length ?? 0}</h3>
            <p className="stat-trend">Jumlah kelas yang sudah terdaftar pada tenant aktif.</p>
          </section>
        </div>
      </section>

      <section className="card section-shell">
        <div>
          <p className="section-eyebrow">Tambah Kelas</p>
          <h3 className="section-title-sm">Buat entri kelas baru</h3>
          <p className="state-text">Gunakan naming yang konsisten untuk grade dan major agar laporan tetap rapi.</p>
        </div>
        <div className="grid-3">
          <FormField label="Nama Kelas">
            <input className="input" value={form.name} placeholder="XII IPA 1" onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
          </FormField>
          <FormField label="Grade">
            <input className="input" value={form.grade} placeholder="XII" onChange={(e) => setForm((v) => ({ ...v, grade: e.target.value }))} />
          </FormField>
          <FormField label="Major">
            <input className="input" value={form.major} placeholder="IPA" onChange={(e) => setForm((v) => ({ ...v, major: e.target.value }))} />
          </FormField>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Simpan Kelas</button>
        </div>
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
              <div className="inline-actions">
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
          <div className="grid-2" style={{ marginTop: 8 }}>
            <FormField label="Nama">
              <input className="input" value={editingClass.name} onChange={(e) => setEditingClass((v) => (v ? { ...v, name: e.target.value } : v))} />
            </FormField>
            <FormField label="Grade">
              <input className="input" value={editingClass.grade ?? ""} onChange={(e) => setEditingClass((v) => (v ? { ...v, grade: e.target.value || null } : v))} />
            </FormField>
            <FormField label="Major">
              <input className="input" value={editingClass.major ?? ""} onChange={(e) => setEditingClass((v) => (v ? { ...v, major: e.target.value || null } : v))} />
            </FormField>
            <FormField label="Status">
              <select className="input" value={String(editingClass.is_active)} onChange={(e) => setEditingClass((v) => (v ? { ...v, is_active: e.target.value === "true" } : v))}>
                <option value="true">active</option>
                <option value="false">inactive</option>
              </select>
            </FormField>
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
