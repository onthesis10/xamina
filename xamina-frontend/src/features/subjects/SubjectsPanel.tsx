import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { api, errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type { SubjectDto, CreateSubjectDto, UpdateSubjectDto, ApiSuccessWithMeta } from "@/types/api.types";

export function SubjectsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<CreateSubjectDto>({ name: "" });
  const [editingSubject, setEditingSubject] = useState<SubjectDto | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<SubjectDto | null>(null);

  const subjectQuery = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const response = await api.get<ApiSuccessWithMeta<SubjectDto[], any>>("/subjects");
      return response.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/subjects", form);
    },
    onSuccess: async () => {
      setForm({ name: "" });
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Mata pelajaran berhasil ditambahkan.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal membuat mata pelajaran."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: UpdateSubjectDto }) => {
      await api.patch(`/subjects/${payload.id}`, payload.data);
    },
    onSuccess: async () => {
      setEditingSubject(null);
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Mata pelajaran berhasil diupdate.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal update mata pelajaran."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/subjects/${id}`);
    },
    onSuccess: async () => {
      setDeletingSubject(null);
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Mata pelajaran berhasil dihapus.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal hapus mata pelajaran."));
    },
  });

  return (
    <section className="panel-grid">
      <section className="page-hero card">
        <div className="page-hero-copy">
          <p className="section-eyebrow">Subject Registry</p>
          <h2 className="section-title">Kelola Daftar Mata Pelajaran</h2>
          <p className="section-desc">Mata pelajaran digunakan untuk mengelompokkan bank soal dan ujian, serta pembagian tugas pengajar.</p>
        </div>
        <div className="metric-grid mixed">
          <section className="card stat-card card-muted">
            <p className="stat-label">Total Mata Pelajaran</p>
            <h3 className="metric-value">{subjectQuery.data?.length ?? 0}</h3>
          </section>
        </div>
      </section>

      <section className="card section-shell">
        <div>
          <p className="section-eyebrow">Tambah Mata Pelajaran</p>
          <h3 className="section-title-sm">Buat mata pelajaran baru</h3>
        </div>
        <div className="grid-3">
          <FormField label="Nama Mata Pelajaran">
            <input className="input" value={form.name} placeholder="Matematika" onChange={(e) => setForm({ name: e.target.value })} />
          </FormField>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name.trim()}>Simpan Mata Pelajaran</button>
        </div>
      </section>

      <DataTable
        title="Daftar Mata Pelajaran"
        rows={subjectQuery.data ?? []}
        loading={subjectQuery.isLoading}
        error={subjectQuery.isError ? errorMessageForCode(subjectQuery.error, {}, "Gagal mengambil data mata pelajaran.") : null}
        columns={[
          { key: "name", header: "Name", render: (s) => s.name },
          { key: "status", header: "Status", render: (s) => <StatusBadge value={s.is_active ? "active" : "inactive"} /> },
          {
            key: "action",
            header: "Action",
            render: (s) => (
              <div className="inline-actions">
                <button className="btn btn-ghost" onClick={() => setEditingSubject(s)}>Edit</button>
                <button className="btn btn-ghost" onClick={() => {
                  updateMutation.mutate({
                    id: s.id,
                    data: { is_active: !s.is_active },
                  });
                }}>
                  {s.is_active ? "Deactivate" : "Activate"}
                </button>
                <button className="btn btn-ghost" onClick={() => setDeletingSubject(s)}>Delete</button>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!editingSubject}
        title="Edit Mata Pelajaran"
        confirmLabel={updateMutation.isPending ? "Saving..." : "Simpan"}
        onCancel={() => setEditingSubject(null)}
        onConfirm={() => {
          if (!editingSubject) return;
          updateMutation.mutate({
            id: editingSubject.id,
            data: {
              name: editingSubject.name,
              is_active: editingSubject.is_active,
            },
          });
        }}
      >
        {editingSubject ? (
          <div className="grid-2" style={{ marginTop: 8 }}>
            <FormField label="Nama">
              <input className="input" value={editingSubject.name} onChange={(e) => setEditingSubject((v) => (v ? { ...v, name: e.target.value } : v))} />
            </FormField>
            <FormField label="Status">
              <select className="input" value={String(editingSubject.is_active)} onChange={(e) => setEditingSubject((v) => (v ? { ...v, is_active: e.target.value === "true" } : v))}>
                <option value="true">active</option>
                <option value="false">inactive</option>
              </select>
            </FormField>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deletingSubject}
        title="Hapus Mata Pelajaran?"
        description={`Mata pelajaran ${deletingSubject?.name ?? ""} akan dihapus.`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Hapus"}
        onCancel={() => setDeletingSubject(null)}
        onConfirm={() => {
          if (!deletingSubject) return;
          deleteMutation.mutate(deletingSubject.id);
        }}
      />
    </section>
  );
}
