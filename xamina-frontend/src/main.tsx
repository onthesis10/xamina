import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { queryClient } from "./lib/queryClient";
import { router } from "./router";
import { useUiStore, type BeforeInstallPromptEvent } from "./store/ui.store";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
    useUiStore.getState().setInstallPromptState("dismissed");
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            // Keep silent; app should continue without offline shell.
        });
    });

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        const promptEvent = event as BeforeInstallPromptEvent;
        useUiStore.getState().setDeferredInstallPrompt(promptEvent);
        useUiStore.getState().setInstallPromptState("available");
    });

    window.addEventListener("appinstalled", () => {
        useUiStore.getState().setDeferredInstallPrompt(null);
        useUiStore.getState().setInstallPromptState("installed");
    });
} else {
    useUiStore.getState().setInstallPromptState("unsupported");
}
