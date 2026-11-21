export function siteOrigin(host: string, port: number): string {
  if (host === 'localhost' || host.endsWith('.localhost')) return `http://${host}:${port}`;
  return `https://${host}`;
}
