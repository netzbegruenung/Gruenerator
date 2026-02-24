export function getDocsUrl(): string {
  const envUrl = import.meta.env.VITE_DOCS_URL;
  if (envUrl) return envUrl;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//localhost:3002`;
  }
  return `${window.location.protocol}//docs.${hostname}`;
}
