import { BUNDESLAENDER } from './bundeslaender';

import type { MonitorLocale } from './hooks/useMonitor';

/** A parliament with its own page under `/umfragen/:land`. */
export interface UmfragenRegion {
  parliament: string;
  label: string;
  locale: MonitorLocale;
  subtitle: string;
}

/** Resolve the `:land` segment (a PolitPro parliament id) — null for anything else. */
export function umfragenRegion(land: string): UmfragenRegion | null {
  if (land === 'oesterreich') {
    return {
      parliament: land,
      label: 'Österreich',
      locale: 'at',
      subtitle: 'Wenn am nächsten Sonntag Nationalratswahl wäre …',
    };
  }
  const bl = BUNDESLAENDER.find((b) => b.id === land);
  if (!bl) return null;
  return {
    parliament: bl.id,
    label: bl.name,
    locale: 'de',
    subtitle: `Wenn am nächsten Sonntag in ${bl.name} gewählt würde …`,
  };
}

export const umfragenPath = (land: string): string => `/umfragen/${land}`;
