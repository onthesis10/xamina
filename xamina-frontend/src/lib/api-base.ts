const DEV_PROXY_API_BASE = "/api/v1";
const DEV_BACKEND_PORT = "8080";
const DEV_BACKEND_HOSTS = new Set(["localhost", "127.0.0.1"]);

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

function isDirectLocalBackend(url: URL) {
    return DEV_BACKEND_HOSTS.has(url.hostname) && url.port === DEV_BACKEND_PORT;
}

function isLocalDevHost(url: URL) {
    return DEV_BACKEND_HOSTS.has(url.hostname);
}

export function resolveApiBaseUrl(rawBaseUrl?: string) {
    const value = rawBaseUrl?.trim();
    if (!value) {
        return DEV_PROXY_API_BASE;
    }

    if (value.startsWith("/")) {
        return trimTrailingSlash(value);
    }

    try {
        const url = new URL(value);
        if (isDirectLocalBackend(url)) {
            return DEV_PROXY_API_BASE;
        }
        return trimTrailingSlash(url.toString());
    } catch {
        return trimTrailingSlash(value);
    }
}

export function resolveWsBaseUrl(rawBaseUrl?: string) {
    const apiBaseUrl = resolveApiBaseUrl(rawBaseUrl);
    if (apiBaseUrl.startsWith("/")) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}`;
    }

    const url = new URL(apiBaseUrl);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}`;
}

export function resolvePublicAssetUrl(rawUrl?: string) {
    const value = rawUrl?.trim();
    if (!value) {
        return null;
    }

    try {
        const url = new URL(value, window.location.origin);
        if (isLocalDevHost(url)) {
            return `${url.pathname}${url.search}${url.hash}`;
        }
        return url.toString();
    } catch {
        return value;
    }
}
