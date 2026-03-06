import { useEffect } from "react";

import { useUiStore } from "@/store/ui.store";
import { UsersPanel } from "@/features/users/UsersPanel";

export function UsersRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Users");
  }, []);
  return <UsersPanel />;
}
