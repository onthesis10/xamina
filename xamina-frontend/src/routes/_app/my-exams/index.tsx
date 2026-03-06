import { useEffect } from "react";

import { MyExamsPanel } from "@/features/exam-session/MyExamsPanel";
import { useUiStore } from "@/store/ui.store";

export function MyExamsRoutePage() {
    useEffect(() => {
        useUiStore.getState().setPageTitle("My Exams");
    }, []);
    return <MyExamsPanel />;
}
