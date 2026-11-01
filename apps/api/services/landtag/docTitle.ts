import { type BundestagCandidate } from '@gruenerator/contracts';

import { deDate } from '../bundestag/qa/docTitle.js';

import { type LandtagMeta } from './registry.js';

/** Anzeigetitel im Chat, dieselbe Form für `landtag` (Liste) und `parlament_lesen`. */
export function landtagDocTitle(
  meta: LandtagMeta,
  c: Pick<BundestagCandidate, 'dokumentnummer' | 'drucksachetyp' | 'datum' | 'urheber'>
): string {
  const nummer = meta.nummer(c.dokumentnummer);
  return [
    nummer,
    // Nennt die Nummernzeile die Art schon (Berliner Anfragen), steht sie nicht doppelt.
    nummer.includes(c.drucksachetyp) ? null : c.drucksachetyp,
    deDate(c.datum),
    c.urheber.join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
