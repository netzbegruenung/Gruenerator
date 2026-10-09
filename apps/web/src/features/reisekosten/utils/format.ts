import { zeitraumText } from '@gruenerator/shared/reisekosten';

export const eur = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** The town of an address ending in "PLZ Ort"; '' when there is none. */
export function ortVon(ziel: string): string {
  return /\b\d{5}\s+([^,]+)$/.exec(ziel.trim())?.[1]?.trim() ?? '';
}

/** "17.10.–18.10.2026 · Offenburg"; parts that are missing are left out. */
export function zeitraumMitOrt(v: Parameters<typeof zeitraumText>[0], ort: string): string {
  return [zeitraumText(v), ort].filter(Boolean).join(' · ');
}
