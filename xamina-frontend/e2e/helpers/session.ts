import type { Page } from "@playwright/test";

type Role = "admin" | "guru" | "siswa";

export async function seedAuthSession(page: Page, role: Role) {
  const userNameByRole: Record<Role, string> = {
    admin: "Admin E2E",
    guru: "Guru E2E",
    siswa: "Siswa E2E",
  };

  await page.addInitScript(
    ({ currentRole, currentName }) => {
      const payload = {
        state: {
          user: {
            id: currentRole === "siswa" ? "student-1" : "teacher-1",
            tenant_id: "tenant-1",
            email: `${currentRole}@xamina.local`,
            name: currentName,
            role: currentRole,
            class_id: currentRole === "siswa" ? "class-1" : null,
          },
          accessToken: "e2e-access-token",
          refreshToken: "e2e-refresh-token",
        },
        version: 0,
      };
      window.localStorage.setItem("xamina-auth", JSON.stringify(payload));
    },
    { currentRole: role, currentName: userNameByRole[role] },
  );
}
