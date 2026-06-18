export function getDocsUrl(): string {
  const envUrl = import.meta.env.VITE_DOCS_URL as string | undefined;
  if (envUrl) return envUrl;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//localhost:3002`;
  }
  // Desktop (Tauri) webview: hostname is `localhost` under origin
  // `tauri://localhost`, so `docs.${hostname}` is wrong — use the public docs host.
  if ('__TAURI__' in window) {
    return 'https://docs.gruenerator.eu';
  }
  return `${window.location.protocol}//docs.${hostname}`;
}
