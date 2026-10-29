/**
 * Stufe „find" für den Nationalrat: normalisierte Filter → eine gecachte Liste
 * je Gesetzgebungsperiode → lokal gefilterte Kandidaten (nur Metadaten).
 *
 * Die Filter-API kann weder Text noch Datum durchsuchen (`filterApi.ts`); was
 * sie nicht kann, erledigt dieser Code an der Liste und sagt es:
 *  - Themenwörter: ODER über Betreff, Themen, Schlagworte und EuroVoc, als
 *    Teilstring mit gekürzter Endung („Mieten" findet „Mietpreisbremse" nicht,
 *    „Windkraft" findet „Windkraftanlagen").
 *  - Protokolle heißen nur „43. Sitzung": sie werden nach Datum gelistet, das
 *    Thema prüft erst `parlament_lesen`.
 */
import { type BundestagCandidate, type LandtagFilter } from '@gruenerator/contracts';

import { keywordsFromQuestion } from '../../bundestag/qa/plan.js';
import { type LandtagFindResult } from '../berlin/find.js';
import { LANDTAGE, resolveFilters } from '../registry.js';

import { gegenstandToCandidate, gpRoman, jsonList, protokollToCandidate } from './documents.js';
import { type NationalratApi, type NrRow } from './filterApi.js';

/** Die laufende Gesetzgebungsperiode und ihr Beginn (konstituierende Sitzung). */
export const CURRENT_GP = 28;
const CURRENT_GP_START = '2024-10-24';

const MAX_CANDIDATES = 25;
const PROTOKOLL_DOKTYP = 'NRSITZ';

/** „windkraft" → „windkra": deutsche Endungen sollen den Teilstring nicht verhindern. */
function stem(word: string): string {
  return word.length >= 7 ? word.slice(0, word.length - 2) : word;
}

function haystack(r: NrRow): string {
  return [
    typeof r.Betreff === 'string' ? r.Betreff : '',
    ...jsonList(r.THEMEN),
    ...jsonList(r.SW),
    ...jsonList(r.EUROVOC),
  ]
    .join(' ')
    .toLowerCase();
}

const inRange = (iso: string, von: string | null, bis: string | null) =>
  !!iso && (!von || iso >= von) && (!bis || iso <= bis);

export async function findNationalrat(
  args: { query: string; filters: LandtagFilter },
  api: NationalratApi
): Promise<LandtagFindResult> {
  const meta = LANDTAGE.nationalrat;
  const f = resolveFilters(meta, args.filters);
  const notes = [...f.notes];
  if (f.empty) return { candidates: [], gesamt: 0, notes: [f.empty, ...notes] };

  const terms = (f.titel ? [f.titel.toLowerCase()] : keywordsFromQuestion(args.query)).map(stem);
  const schlagwort = args.filters.schlagwort?.toLowerCase() ?? null;
  const hasCriterion =
    terms.length > 0 ||
    !!schlagwort ||
    f.typen.length > 0 ||
    f.fraktionen.length > 0 ||
    f.wahlperiode != null ||
    !!f.datumVon ||
    !!f.datumBis;
  if (!hasCriterion) {
    return { candidates: [], gesamt: 0, notes: ['Suchbegriff oder Filter fehlt.', ...notes] };
  }

  const gp = f.wahlperiode ?? CURRENT_GP;
  if (f.wahlperiode == null && f.datumVon && f.datumVon < CURRENT_GP_START) {
    notes.push(
      `Durchsucht wurde nur die laufende ${gpRoman(CURRENT_GP)}. Gesetzgebungsperiode (seit 24.10.2024); für frühere \`wahlperiode\` angeben (z. B. 27).`
    );
  }

  const wantProtokolle = f.typen.includes(PROTOKOLL_DOKTYP);
  const gegenstandTypen = f.typen.filter((t) => t !== PROTOKOLL_DOKTYP);
  const wantGegenstaende = f.typen.length === 0 || gegenstandTypen.length > 0;

  const docs: BundestagCandidate[] = [];
  if (wantGegenstaende) {
    const want = new Set(f.fraktionen);
    for (const r of await api.gegenstaende(gpRoman(gp))) {
      if (gegenstandTypen.length > 0 && !gegenstandTypen.includes(String(r.DOKTYP))) continue;
      if (want.size > 0 && !jsonList(r.Fraktionen).some((x) => want.has(x))) continue;
      if (terms.length > 0 || schlagwort) {
        const text = haystack(r);
        if (terms.length > 0 && !terms.some((t) => text.includes(t))) continue;
        if (schlagwort && !text.includes(schlagwort)) continue;
      }
      const c = gegenstandToCandidate(r);
      if (c && ((!f.datumVon && !f.datumBis) || inRange(c.datum, f.datumVon, f.datumBis))) {
        docs.push(c);
      }
    }
    if (want.size > 0 && f.typen.length === 0) {
      notes.push(
        'Regierungsvorlagen und Ausschussberichte tragen keine Fraktion und fehlen bei einem Fraktionsfilter.'
      );
    }
  }
  if (wantProtokolle) {
    for (const r of await api.protokolle(gpRoman(gp))) {
      const c = protokollToCandidate(r, gp);
      if (c && ((!f.datumVon && !f.datumBis) || inRange(c.datum, f.datumVon, f.datumBis))) {
        docs.push(c);
      }
    }
    if (terms.length > 0 || schlagwort) {
      notes.push(
        'Sitzungsprotokolle sind nur nach Datum gelistet, nicht nach Thema; ob eine Sitzung das Thema behandelt, zeigt erst `parlament_lesen` (mit `fokus`).'
      );
    }
  }

  const sorted = docs.sort((a, b) => b.datum.localeCompare(a.datum));
  const candidates = sorted.slice(0, MAX_CANDIDATES);
  if (sorted.length > candidates.length) {
    notes.push(
      `Gezeigt werden die neuesten ${candidates.length} von ${sorted.length} Treffern; mit Zeitraum, Art oder einem genaueren Thema eingrenzen.`
    );
  }
  if (candidates.length === 0 && terms.length > 0) {
    notes.push(
      'Keine Treffer in Betreff, Themen und Schlagworten; ein anderes Themenwort oder ein Oberbegriff probieren.'
    );
  }
  return { candidates, gesamt: sorted.length, notes };
}
