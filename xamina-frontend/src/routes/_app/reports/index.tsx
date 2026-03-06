import { useEffect } from "react";

import { ReportsPanel } from "@/features/analytics/ReportsPanel";
import { useUiStore } from "@/store/ui.store";

export function ReportsRoutePage() {
    useEffect(() => {
        useUiStore.getState().setPageTitle("Reports");
    }, []);

    return <ReportsPanel />;
}
