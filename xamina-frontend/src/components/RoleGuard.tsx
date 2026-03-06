import { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAuthStore } from "@/store/auth.store";
import type { Role } from "@/types/common.types";

interface RoleGuardProps {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ allow, children, fallback }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  if (!user) {
    void navigate({ to: "/auth/login" });
    return null;
  }

  if (!allow.includes(user.role)) {
    return fallback ?? <p className="state-text error">You do not have access to this page.</p>;
  }

  return <>{children}</>;
}
