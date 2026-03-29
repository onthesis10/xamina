import { api } from "@/lib/axios";
import { resolveApiBaseUrl, resolvePublicAssetUrl } from "@/lib/api-base";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";

const DEFAULT_EXPECTED_CONTENT_TYPES = ["pdf", "octet-stream"];

function apiBaseForFetch() {
  return resolveApiBaseUrl(import.meta.env.VITE_API_URL).replace(/\/+$/, "");
}

function buildFetchHeaders() {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    throw new Error("Missing auth token");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  const user = useAuthStore.getState().user;
  const selectedTenantId = useUiStore.getState().activeTenantId;
  if (user?.role === "super_admin" && selectedTenantId) {
    headers["X-Tenant-Id"] = selectedTenantId;
  }

  return headers;
}

function hasExpectedContentType(contentType: string, expectedContentTypes: string[]) {
  const normalized = contentType.toLowerCase();
  return expectedContentTypes.some((candidate) => normalized.includes(candidate.toLowerCase()));
}

async function readErrorMessage(response: Response) {
  const maybeJson = await response.json().catch(() => null);
  return maybeJson?.error?.message || `File request failed with status ${response.status}`;
}

async function downloadBinaryWithFetch(
  path: string,
  expectedContentTypes: string[],
  fallbackMimeType: string,
): Promise<Blob> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${apiBaseForFetch()}${path}${separator}ts=${Date.now()}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: buildFetchHeaders(),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    throw new Error("File response is JSON");
  }

  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }
  if (!hasExpectedContentType(contentType, expectedContentTypes)) {
    throw new Error("Downloaded file has unexpected content type");
  }

  return new Blob([buffer], {
    type: contentType || fallbackMimeType,
  });
}

async function downloadBinaryWithAxios(
  path: string,
  expectedContentTypes: string[],
  fallbackMimeType: string,
): Promise<Blob> {
  const response = await api.get<ArrayBuffer>(path, {
    responseType: "arraybuffer",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  const contentType = String(response.headers["content-type"] ?? "");
  const buffer = response.data;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }
  if (!hasExpectedContentType(contentType, expectedContentTypes)) {
    throw new Error("Downloaded file has unexpected content type");
  }

  return new Blob([buffer], {
    type: contentType || fallbackMimeType,
  });
}

export async function downloadBinaryFile(
  path: string,
  options?: {
    expectedContentTypes?: string[];
    fallbackMimeType?: string;
  },
) {
  const expectedContentTypes = options?.expectedContentTypes ?? DEFAULT_EXPECTED_CONTENT_TYPES;
  const fallbackMimeType = options?.fallbackMimeType ?? "application/octet-stream";

  try {
    return await downloadBinaryWithFetch(path, expectedContentTypes, fallbackMimeType);
  } catch {
    return downloadBinaryWithAxios(path, expectedContentTypes, fallbackMimeType);
  }
}

export async function downloadPublicAssetFile(
  rawUrl?: string,
  options?: {
    expectedContentTypes?: string[];
    fallbackMimeType?: string;
    cacheBust?: boolean;
  },
) {
  const resolved = resolvePublicAssetUrl(rawUrl);
  if (!resolved) {
    return null;
  }

  const expectedContentTypes = options?.expectedContentTypes ?? DEFAULT_EXPECTED_CONTENT_TYPES;
  const fallbackMimeType = options?.fallbackMimeType ?? "application/octet-stream";
  const candidates = new Set<string>([resolved]);

  try {
    const url = new URL(resolved, window.location.origin);
    if (url.pathname.startsWith("/uploads/")) {
      candidates.add(`${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // Ignore malformed URL; fallback to resolved string only.
  }

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate, window.location.origin);
    } catch {
      continue;
    }

    if (options?.cacheBust ?? true) {
      url.searchParams.set("ts", Date.now().toString());
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!response.ok) {
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      continue;
    }

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      continue;
    }
    if (!hasExpectedContentType(contentType, expectedContentTypes)) {
      continue;
    }

    return new Blob([buffer], {
      type: contentType || fallbackMimeType,
    });
  }

  return null;
}

export function saveBlobAsFile(blob: Blob, filename: string) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("Downloaded file is empty");
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}
