export const eur = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** The town of an address ending in "PLZ Ort"; '' when there is none. */
export function ortVon(ziel: string): string {
  return /\b\d{5}\s+([^,]+)$/.exec(ziel.trim())?.[1]?.trim() ?? '';
}

const tagMonat = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** "17.10.–18.10.2026 · Offenburg"; parts that are missing are left out. */
export function zeitraumMitOrt(beginn: string | undefined, ende: string | undefined, ort: string) {
  let zeitraum = '';
  if (beginn) {
    const bis = ende && ende.slice(0, 10) !== beginn.slice(0, 10) ? ende : null;
    zeitraum = bis
      ? `${tagMonat(beginn)}–${tagMonat(bis)}${bis.slice(0, 4)}`
      : `${tagMonat(beginn)}${beginn.slice(0, 4)}`;
  }
  return [zeitraum, ort].filter(Boolean).join(' · ');
}
