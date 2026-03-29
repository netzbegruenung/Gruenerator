// Utility to get the FastAPI base URL
export function getFastAPIUrl(): string {
  const queryFastApiUrl = getFastApiUrlFromQuery();
  if (queryFastApiUrl) {
    return queryFastApiUrl;
  }

  // Prefer Electron-preload env when available
  if (typeof window !== "undefined" && (window as any).env?.NEXT_PUBLIC_FAST_API) {
    return (window as any).env.NEXT_PUBLIC_FAST_API;
  }

  // In Electron, NEXT_PUBLIC_FAST_API is set by setupEnv in main.ts
  if (process.env.NEXT_PUBLIC_FAST_API) {
    return process.env.NEXT_PUBLIC_FAST_API;
  }

  // Safe Electron fallback to local FastAPI
  return "http://127.0.0.1:8000";
}

function getFastApiUrlFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("fastapiUrl");
    if (!value) return null;

    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function isAbsoluteHttpUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && !!(window as any).electron;
}

// Utility to construct API URL that works in both web and Electron.
export function getApiUrl(path: string): string {
  if (isAbsoluteHttpUrl(path)) {
    return path;
  }

  const normalizedPath = withLeadingSlash(path);
  const isFastApiEndpoint = normalizedPath.startsWith("/api/v1/");
  const hasWindowFastApi = typeof window !== "undefined" && !!(window as any).env?.NEXT_PUBLIC_FAST_API;
  const hasQueryFastApi = !!getFastApiUrlFromQuery();

  // In web/docker, /api/v1 is typically reverse-proxied by the web server.
  // In Electron, Next and FastAPI run on different ports, so use FastAPI base URL.
  if (
    isFastApiEndpoint &&
    (isElectronRuntime() || !!process.env.NEXT_PUBLIC_FAST_API || hasWindowFastApi || hasQueryFastApi)
  ) {
    return `${getFastAPIUrl()}${normalizedPath}`;
  }

  return normalizedPath;
}