export function resolveVoiceWsUrl(apiBaseUrl: string | undefined, endpoint: string): string {
  const base = apiBaseUrl ?? '';
  // Same-origin: derive scheme from window.location.protocol. HTTPS pages
  // block `ws://` synchronously via Mixed Content, which tears down the UI
  // within a frame — that's why this matters even for localhost dev tunnels.
  const protocol = base
    ? base.startsWith('https')
      ? 'wss'
      : 'ws'
    : typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'wss'
      : 'ws';
  const host =
    base.replace(/^https?:\/\//, '') || (typeof window !== 'undefined' ? window.location.host : '');
  return `${protocol}://${host}${endpoint}`;
}
