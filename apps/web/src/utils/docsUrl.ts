/**
 * The docs live under the `doku.` subdomain, not `docs.`: `docs.gruenerator.eu`
 * 301s to the main app, which then serves the SPA shell for `/docs/*` — so
 * every deep link built from it renders the app instead of the page and reads
 * as a broken link. The host is still derived from the current hostname so
 * test/prod environments keep resolving to their own docs deployment.
 */
const DOCS_SUBDOMAIN = 'doku';

export function getDocsUrl(): string {
  const envUrl = import.meta.env.VITE_DOCS_URL as string | undefined;
  if (envUrl) return envUrl;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//localhost:3002`;
  }
  // Desktop (Tauri) webview: hostname is `localhost` under origin
  // `tauri://localhost`, so `doku.${hostname}` is wrong — use the public docs host.
  if ('__TAURI__' in window) {
    return `https://${DOCS_SUBDOMAIN}.gruenerator.eu`;
  }
  return `${window.location.protocol}//${DOCS_SUBDOMAIN}.${hostname}`;
}
