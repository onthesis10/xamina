import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const DEFAULT_API_PROXY_TARGET = "http://127.0.0.1:8080";
const LOCAL_API_PROXY_CANDIDATES = [
    "http://127.0.0.1:18080",
    "http://127.0.0.1:8080",
];

async function canReachApiProxyTarget(target: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);

    try {
        const response = await fetch(`${target}/health`, {
            signal: controller.signal,
        });
        return response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

async function resolveApiProxyTarget() {
    const explicitTarget = process.env.VITE_API_PROXY_TARGET?.trim();
    if (explicitTarget) {
        return explicitTarget;
    }

    for (const candidate of LOCAL_API_PROXY_CANDIDATES) {
        if (await canReachApiProxyTarget(candidate)) {
            return candidate;
        }
    }

    return DEFAULT_API_PROXY_TARGET;
}

export default defineConfig(async () => {
    const apiProxyTarget = await resolveApiProxyTarget();

    return {
        plugins: [react()],
        server: {
            proxy: {
                "/api": {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
                "/health": {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
                "/metrics": {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
                "/uploads": {
                    target: apiProxyTarget,
                    changeOrigin: true,
                },
                "/ws": {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    ws: true,
                },
            },
        },
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
    };
});
