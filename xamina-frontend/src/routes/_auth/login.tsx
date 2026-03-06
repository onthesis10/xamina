import { useEffect } from "react";

import { LoginForm } from "@/features/auth/LoginForm";
import { useUiStore } from "@/store/ui.store";

export function LoginRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Login");
  }, []);
  return <LoginForm />;
}
