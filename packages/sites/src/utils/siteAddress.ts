const FALLBACK_HOST = 'grsites.de';

export function addressHost(publicOrigin: string | null): string {
  if (!publicOrigin) return FALLBACK_HOST;
  try {
    return new URL(publicOrigin).host || FALLBACK_HOST;
  } catch {
    return publicOrigin.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || FALLBACK_HOST;
  }
}

export function formatAddress(publicOrigin: string | null, name: string): string {
  return `${addressHost(publicOrigin)}/${name}`;
}
