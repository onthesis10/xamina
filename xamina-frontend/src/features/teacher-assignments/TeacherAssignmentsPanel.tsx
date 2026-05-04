import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { api, errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type {
  ApiSuccess,
  ApiSuccessWithMeta,
  TeacherAssignmentDto,
  UserDto,
  SubjectDto,
  ClassDto,
} from "@/types/api.types";

export function TeacherAssignmentsPanel() {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState<{ teacher_id: string; subject_id: string }>({
    teacher_id: "",
    subject_id: "",
  });
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [deletingAssignment, setDeletingAssignment] = useState<TeacherAssignmentDto | null>(null);

  // Data fetching
  const assignmentsQuery = useQuery({
    queryKey: ["teacher-assignments"],
    queryFn: async () => {
      const response = await api.get<ApiSuccessWithMeta<TeacherAssignmentDto[], any>>("/teacher-assignments");
      return response.data.data;
    },
  });

  const teachersQuery = useQuery({
    queryKey: ["users", "guru"],
    queryFn: async () => {
      const response = await api.get<ApiSuccessWithMeta<UserDto[], any>>("/users?role=guru&page_size=1000");
      return response.data.data;
    },
  });

  const subjectsQuery = useQuery({
    queryKey: ["subjects", "all"],
    queryFn: async () => {
      const response = await api.get<ApiSuccess<SubjectDto[]>>("/subjects/all");
      return response.data.data;
    },
  });

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const response = await api.get<ApiSuccess<ClassDto[]>>("/classes");
      return response.data.data.filter(c => c.is_active);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Loop POST for each selected class
      for (const classId of selectedClassIds) {
        await api.post("/teacher-assignments", {
          teacher_id: form.teacher_id,
          subject_id: form.subject_id,
          class_id: classId,
        });
      }
    },
    onSuccess: async () => {
      setForm({ teacher_id: "", subject_id: "" });
      setSelectedClassIds([]);
      await qc.invalidateQueries({ queryKey: ["teacher-assignments"] });
      toast.success(`${selectedClassIds.length} assignment berhasil ditambahkan.`);
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal menambahkan assignment."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/teacher-assignments/${id}`);
    },
    onSuccess: async () => {
      setDeletingAssignment(null);
      await qc.invalidateQueries({ queryKey: ["teacher-assignments"] });
      toast.success("Assignment berhasil dihapus.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal menghapus assignment."));
    },
  });

  const isFormComplete = form.teacher_id && form.subject_id && selectedClassIds.length > 0;

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const toggleAllClasses = () => {
    const allIds = (classesQuery.data ?? []).map(c => c.id);
    if (selectedClassIds.length === allIds.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(allIds);
    }
  };

  return (
    <section className="panel-grid">
      <section className="page-hero card">
        <div className="page-hero-copy">
          <p className="section-eyebrow">Teacher Assignments</p>
          <h2 className="section-title">Mapping Guru & Mata Pelajaran</h2>
          <p className="section-desc">Atur guru mana saja yang mengajar mata pelajaran tertentu di kelas tertentu. Akses ujian dan bank soal akan mengikuti aturan ini.</p>
        </div>
        <div className="metric-grid mixed">
          <section className="card stat-card card-muted">
            <p className="stat-label">Total Assignments</p>
            <h3 className="metric-value">{assignmentsQuery.data?.length ?? 0}</h3>
          </section>
        </div>
      </section>

      <section className="card section-shell">
        <div>
          <p className="section-eyebrow">Tambah Assignment</p>
          <h3 className="section-title-sm">Buat mapping baru</h3>
        </div>
        <div className="grid-3">
          <FormField label="Guru">
            <select
              className="input"
              value={form.teacher_id}
              onChange={(e) => setForm((v) => ({ ...v, teacher_id: e.target.value }))}
            >
              <option value="">-- Pilih Guru --</option>
              {teachersQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Mata Pelajaran">
            <select
              className="input"
              value={form.subject_id}
              onChange={(e) => setForm((v) => ({ ...v, subject_id: e.target.value }))}
            >
              <option value="">-- Pilih Mata Pelajaran --</option>
              {subjectsQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={`Kelas (${selectedClassIds.length} dipilih)`}>
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              maxHeight: 180,
              overflowY: "auto",
              padding: "8px 0",
              background: "var(--bg-1)",
            }}>
              {/* Select All */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--primary)",
                  borderBottom: "1px solid var(--border)",
                  marginBottom: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    (classesQuery.data ?? []).length > 0 &&
                    selectedClassIds.length === (classesQuery.data ?? []).length
                  }
                  onChange={toggleAllClasses}
                  style={{ accentColor: "var(--primary)" }}
                />
                <span>Pilih Semua</span>
              </label>
              {(classesQuery.data ?? []).map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    cursor: "pointer",
                    fontSize: 13,
                    borderRadius: 6,
                    transition: "background 0.15s ease",
                    background: selectedClassIds.includes(c.id)
                      ? "var(--primary-bg)"
                      : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(c.id)}
                    onChange={() => toggleClass(c.id)}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  <span style={{
                    color: selectedClassIds.includes(c.id) ? "var(--primary)" : "var(--text-1)",
                    fontWeight: selectedClassIds.includes(c.id) ? 600 : 400,
                  }}>
                    {c.name}
                  </span>
                </label>
              ))}
              {(classesQuery.data ?? []).length === 0 && (
                <p className="state-text" style={{ padding: "8px 14px", fontSize: 12 }}>
                  Belum ada kelas aktif.
                </p>
              )}
            </div>
          </FormField>
        </div>
        <div className="page-actions">
          <button
            className="btn"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !isFormComplete}
          >
            {createMutation.isPending
              ? `Menyimpan ${selectedClassIds.length} assignment...`
              : `Simpan ${selectedClassIds.length > 0 ? selectedClassIds.length : ""} Assignment`}
          </button>
        </div>
      </section>

      <DataTable
        title="Daftar Mapping Guru"
        rows={assignmentsQuery.data ?? []}
        loading={assignmentsQuery.isLoading}
        error={assignmentsQuery.isError ? errorMessageForCode(assignmentsQuery.error, {}, "Gagal mengambil data.") : null}
        columns={[
          { key: "teacher_name", header: "Guru", render: (a) => a.teacher_name },
          { key: "subject_name", header: "Mata Pelajaran", render: (a) => a.subject_name },
          { key: "class_name", header: "Kelas", render: (a) => a.class_name },
          {
            key: "action",
            header: "Action",
            render: (a) => (
              <div className="inline-actions">
                <button className="btn btn-ghost" onClick={() => setDeletingAssignment(a)}>Hapus</button>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!deletingAssignment}
        title="Hapus Assignment?"
        description={`Hapus akses mengajar ${deletingAssignment?.teacher_name} untuk ${deletingAssignment?.subject_name} di kelas ${deletingAssignment?.class_name}?`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Hapus"}
        onCancel={() => setDeletingAssignment(null)}
        onConfirm={() => {
          if (!deletingAssignment) return;
          deleteMutation.mutate(deletingAssignment.id);
        }}
      />
    </section>
  );
}
