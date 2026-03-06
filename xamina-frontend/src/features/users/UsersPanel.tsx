import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { api, errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import type {
  ApiSuccess,
  ApiSuccessWithMeta,
  ClassDto,
  CreateUserDto,
  CsvImportResult,
  PageMeta,
  UpdateUserDto,
  UserDto,
  UserListQuery,
} from "@/types/api.types";

interface UserFormState {
  email: string;
  name: string;
  role: CreateUserDto["role"];
  class_id: string;
  password: string;
}

const EMPTY_FORM: UserFormState = {
  email: "",
  name: "",
  role: "siswa",
  class_id: "",
  password: "",
};

const CSV_TEMPLATE = "name,email,class_name,password\nSiswa 1,siswa1@mail.com,X IPA 1,Password123!\n";

function parseQueryFromUrl(): UserListQuery {
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("page_size") ?? "20");
  const search = params.get("search") ?? "";
  const role = params.get("role") ?? undefined;
  const classId = params.get("class_id") ?? undefined;
  const isActiveRaw = params.get("is_active");
  const is_active = isActiveRaw === null ? undefined : isActiveRaw === "true";

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    page_size: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    search,
    role: role as CreateUserDto["role"] | undefined,
    class_id: classId,
    is_active,
  };
}

function writeQueryToUrl(query: UserListQuery) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));
  if (query.search) params.set("search", query.search);
  if (query.role) params.set("role", query.role);
  if (query.class_id) params.set("class_id", query.class_id);
  if (typeof query.is_active === "boolean") params.set("is_active", String(query.is_active));

  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState(null, "", next);
}

export function UsersPanel() {
  const qc = useQueryClient();
  const toast = useToast();

  const [query, setQuery] = useState<UserListQuery>(() => parseQueryFromUrl());
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserDto | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<CsvImportResult | null>(null);

  useEffect(() => {
    writeQueryToUrl(query);
  }, [query]);

  const classesQuery = useQuery({
    queryKey: ["classes-for-user-panel"],
    queryFn: async () => {
      const response = await api.get<ApiSuccess<ClassDto[]>>("/classes");
      return response.data.data;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["users", query],
    queryFn: async () => {
      const response = await api.get<ApiSuccessWithMeta<UserDto[], PageMeta>>("/users", { params: query });
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/users", {
        email: form.email,
        name: form.name,
        role: form.role,
        class_id: form.class_id || undefined,
        password: form.password || undefined,
      });
    },
    onSuccess: async () => {
      setForm(EMPTY_FORM);
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User berhasil ditambahkan.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal membuat user."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: UpdateUserDto }) => {
      await api.patch(`/users/${payload.id}`, payload.data);
    },
    onSuccess: async () => {
      setEditingUser(null);
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User berhasil diupdate.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal update user."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: async () => {
      setDeletingUser(null);
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User berhasil dihapus.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal hapus user."));
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const response = await api.post<ApiSuccess<CsvImportResult>>("/users/import-csv-file", fd);
        return { result: response.data.data, fallbackUsed: false };
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status !== 404 && status !== 405) {
          throw error;
        }

        // Backward-compatible fallback for API instances that still expose only text CSV import.
        const csvText = await file.text();
        const legacyResponse = await api.post<ApiSuccess<CsvImportResult>>("/users/import-csv", csvText, {
          headers: { "Content-Type": "text/plain" },
        });
        return { result: legacyResponse.data.data, fallbackUsed: true };
      }
    },
    onSuccess: async ({ result, fallbackUsed }) => {
      setImportPreview(result);
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`Import selesai: ${result.inserted} inserted, ${result.failed} failed.`);
      if (fallbackUsed) {
        toast.info("Server masih pakai endpoint legacy import-csv. Fallback otomatis digunakan.");
      }
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal import CSV file."));
    },
  });

  const users = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;
  const classOptions = classesQuery.data ?? [];

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.page_size ?? 20))),
    [meta],
  );

  return (
    <section className="panel-grid">
      <section className="card">
        <h3 className="section-title">Tambah User</h3>
        <div className="grid-4">
          <input className="input" placeholder="name" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
          <input className="input" placeholder="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} />
          <select className="input" value={form.role} onChange={(e) => setForm((v) => ({ ...v, role: e.target.value as CreateUserDto["role"] }))}>
            <option value="admin">admin</option>
            <option value="guru">guru</option>
            <option value="siswa">siswa</option>
          </select>
          <select className="input" value={form.class_id} onChange={(e) => setForm((v) => ({ ...v, class_id: e.target.value }))}>
            <option value="">no class</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input className="input" type="password" placeholder="password" value={form.password} onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))} />
        </div>
        <div className="row gap-sm" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Simpan User</button>
          <button className="btn btn-ghost" onClick={() => setShowImportModal(true)}>Import CSV File</button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "users-import-template.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download Template
          </button>
        </div>
      </section>

      <DataTable
        title="Daftar Users"
        rows={users}
        loading={usersQuery.isLoading}
        error={usersQuery.isError ? errorMessageForCode(usersQuery.error, {}, "Gagal mengambil data users.") : null}
        actions={
          <div className="panel-grid">
            <div className="grid-4">
              <input className="input" placeholder="search" value={query.search ?? ""} onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value, page: 1 }))} />
              <select className="input" value={query.role ?? ""} onChange={(e) => setQuery((q) => ({ ...q, role: (e.target.value || undefined) as CreateUserDto["role"] | undefined, page: 1 }))}>
                <option value="">all roles</option>
                <option value="admin">admin</option>
                <option value="guru">guru</option>
                <option value="siswa">siswa</option>
              </select>
              <select className="input" value={query.class_id ?? ""} onChange={(e) => setQuery((q) => ({ ...q, class_id: e.target.value || undefined, page: 1 }))}>
                <option value="">all classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select className="input" value={typeof query.is_active === "boolean" ? String(query.is_active) : ""} onChange={(e) => setQuery((q) => ({ ...q, is_active: e.target.value === "" ? undefined : e.target.value === "true", page: 1 }))}>
                <option value="">all status</option>
                <option value="true">active</option>
                <option value="false">inactive</option>
              </select>
            </div>
            <div className="row gap-sm">
              <button className="btn btn-ghost" onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) > 1 ? (q.page ?? 1) - 1 : 1 }))}>Prev</button>
              <button className="btn btn-ghost" onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}>Next</button>
              <span className="state-text">Page {meta?.page ?? 1} / {pageCount}</span>
            </div>
          </div>
        }
        columns={[
          { key: "name", header: "Name", render: (u) => u.name },
          { key: "email", header: "Email", render: (u) => u.email },
          { key: "role", header: "Role", render: (u) => u.role },
          {
            key: "class",
            header: "Class",
            render: (u) => classOptions.find((c) => c.id === u.class_id)?.name ?? "-",
          },
          { key: "status", header: "Status", render: (u) => <StatusBadge value={u.is_active ? "active" : "inactive"} /> },
          {
            key: "action",
            header: "Action",
            render: (u) => (
              <div className="row gap-sm">
                <button className="btn btn-ghost" onClick={() => setEditingUser(u)}>Edit</button>
                <button className="btn btn-ghost" onClick={() => setDeletingUser(u)}>Delete</button>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!deletingUser}
        title="Hapus user?"
        description={`User ${deletingUser?.name ?? ""} akan dihapus.`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Hapus"}
        onCancel={() => setDeletingUser(null)}
        onConfirm={() => {
          if (!deletingUser) return;
          deleteMutation.mutate(deletingUser.id);
        }}
      />

      <ConfirmDialog
        open={!!editingUser}
        title="Edit user"
        confirmLabel={updateMutation.isPending ? "Saving..." : "Simpan"}
        onCancel={() => setEditingUser(null)}
        onConfirm={() => {
          if (!editingUser) return;
          const payload: UpdateUserDto = {
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role,
            class_id: editingUser.class_id ?? undefined,
            is_active: editingUser.is_active,
          };
          updateMutation.mutate({ id: editingUser.id, data: payload });
        }}
      >
        {editingUser ? (
          <div className="panel-grid" style={{ marginTop: 8 }}>
            <input className="input" value={editingUser.name} onChange={(e) => setEditingUser((u) => (u ? { ...u, name: e.target.value } : u))} />
            <input className="input" value={editingUser.email} onChange={(e) => setEditingUser((u) => (u ? { ...u, email: e.target.value } : u))} />
            <select className="input" value={editingUser.role} onChange={(e) => setEditingUser((u) => (u ? { ...u, role: e.target.value as CreateUserDto["role"] } : u))}>
              <option value="admin">admin</option>
              <option value="guru">guru</option>
              <option value="siswa">siswa</option>
            </select>
            <select className="input" value={editingUser.class_id ?? ""} onChange={(e) => setEditingUser((u) => (u ? { ...u, class_id: e.target.value || null } : u))}>
              <option value="">no class</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="input" value={String(editingUser.is_active)} onChange={(e) => setEditingUser((u) => (u ? { ...u, is_active: e.target.value === "true" } : u))}>
              <option value="true">active</option>
              <option value="false">inactive</option>
            </select>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={showImportModal}
        title="Import CSV File"
        confirmLabel={importMutation.isPending ? "Importing..." : "Import"}
        onCancel={() => {
          setShowImportModal(false);
          setCsvFile(null);
          setImportPreview(null);
        }}
        onConfirm={() => {
          if (!csvFile) {
            toast.error("Pilih file CSV terlebih dulu.");
            return;
          }
          importMutation.mutate(csvFile);
        }}
      >
        <div className="panel-grid" style={{ marginTop: 8 }}>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          />
          {csvFile ? <small className="state-text">Selected: {csvFile.name}</small> : null}
          {importPreview ? (
            <div className="card" style={{ boxShadow: "none" }}>
              <p className="state-text">Inserted: {importPreview.inserted} | Failed: {importPreview.failed}</p>
              {importPreview.errors.length > 0 ? (
                <div className="table-wrap" style={{ maxHeight: 220 }}>
                  <table className="x-table">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.errors.map((err) => (
                        <tr key={`${err.line}-${err.reason}`}>
                          <td>{err.line}</td>
                          <td>{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </ConfirmDialog>
    </section>
  );
}
