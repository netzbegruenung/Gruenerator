import { type BundestagCandidate } from '@gruenerator/contracts';

/** „2025-10-01" → „01.10.2025"; alles andere bleibt, wie DIP es liefert. */
export function deDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * Anzeigetitel eines Dokuments im Chat: „BT-Drs. 21/1928 · Gesetzentwurf · 01.10.2025 · Bundesregierung"
 * bzw. „Plenardebatte PlPr 21/80 · 01.10.2025". Dieselbe Form für `bundestag` (Liste) und `parlament_lesen`.
 */
export function bundestagDocTitle(
  c: Pick<BundestagCandidate, 'ref' | 'dokumentnummer' | 'drucksachetyp' | 'datum' | 'urheber'>
): string {
  const plpr = /^PlPr \d{1,2}\/\d{1,4}/.exec(c.ref)?.[0];
  if (plpr) return `Plenardebatte ${plpr} · ${deDate(c.datum)}`;
  return [
    `BT-Drs. ${c.dokumentnummer}`,
    c.drucksachetyp,
    deDate(c.datum),
    c.urheber.join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
