import { type BundestagCandidate } from '@gruenerator/contracts';

import { deDate } from '../bundestag/qa/docTitle.js';

import { type LandtagMeta } from './registry.js';

/** „BE 19/S27288" → „Schriftliche Anfrage BE 19/27288"; „BE 19/3519" → „BE-Drs. 19/3519". */
function numberLabel(meta: LandtagMeta, c: Pick<BundestagCandidate, 'dokumentnummer'>): string {
  const [wp, nr = ''] = c.dokumentnummer.split('/');
  return nr.startsWith('S')
    ? `${meta.refPrefix} Schriftliche Anfrage ${wp}/${nr.slice(1)}`
    : `${meta.refPrefix}-Drs. ${c.dokumentnummer}`;
}

/** Anzeigetitel im Chat, dieselbe Form für `landtag` (Liste) und `parlament_lesen`. */
export function landtagDocTitle(
  meta: LandtagMeta,
  c: Pick<BundestagCandidate, 'dokumentnummer' | 'drucksachetyp' | 'datum' | 'urheber'>
): string {
  const anfrage = c.dokumentnummer.split('/')[1]?.startsWith('S') ?? false;
  return [
    numberLabel(meta, c),
    // Die Nummernzeile nennt bei Anfragen die Art schon.
    anfrage ? null : c.drucksachetyp,
    deDate(c.datum),
    c.urheber.join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
