import { useEffect } from "react";

import { useUiStore } from "@/store/ui.store";
import { ClassesPanel } from "@/features/classes/ClassesPanel";

export function ClassesRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Classes");
  }, []);
  return <ClassesPanel />;
}
