import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { queryClient } from "./lib/queryClient";
import { router } from "./router";
import { useUiStore, type BeforeInstallPromptEvent } from "./store/ui.store";
import "./index.css";

// Inject Analytics Script if available
if (import.meta.env.VITE_PUBLIC_ANALYTICS_ID) {
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${import.meta.env.VITE_PUBLIC_ANALYTICS_ID}`;
    script.async = true;
    document.head.appendChild(script);

    const inlineScript = document.createElement("script");
    inlineScript.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${import.meta.env.VITE_PUBLIC_ANALYTICS_ID}');
    `;
    document.head.appendChild(inlineScript);
}


ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </React.StrictMode>,
);

const THEME_COLORS = {
    light: "#FDFAF6",
    dark: "#0D0700",
    fun: "#FFF8F0",
} as const;

function applyTheme(mode: keyof typeof THEME_COLORS) {
    document.documentElement.dataset.mode = mode;
    document.body.dataset.mode = mode;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
        themeMeta.setAttribute("content", THEME_COLORS[mode]);
    }
}

applyTheme(useUiStore.getState().themeMode);
useUiStore.subscribe((state) => {
    applyTheme(state.themeMode);
});

if ("serviceWorker" in navigator) {
    if (import.meta.env.DEV) {
        useUiStore.getState().setInstallPromptState("unsupported");
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .getRegistrations()
                .then((registrations) =>
                    Promise.all(registrations.map((registration) => registration.unregister())),
                )
                .then(async () => {
                    if (!("caches" in window)) return;
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                })
                .catch(() => {
                    // Keep silent; dev mode can continue without SW cleanup guarantees.
                });
        });
    } else {
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
    }
} else {
    useUiStore.getState().setInstallPromptState("unsupported");
}
