export interface SiteLinks {
  home: string;
  impressum: string;
  datenschutz: string;
  report: string | null;
}

export function sitePaths(handle: string): Pick<SiteLinks, 'home' | 'impressum' | 'datenschutz'> {
  const base = `/${encodeURIComponent(handle)}`;
  return { home: base, impressum: `${base}/impressum`, datenschutz: `${base}/datenschutz` };
}
