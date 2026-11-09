/**
 * Stufe „find" für den Landtag NRW, gegen das Notebook statt gegen eine API.
 *
 * - Mit `query` rankt die dichte Suche nach Inhalt (die Liste ist dann nach
 *   Nähe sortiert, nicht nach Datum); ohne `query` die neuesten zuerst.
 * - `titel` sucht im Kopf von Chunk 0 (Titel, Art, Urheber, Inhaltsangabe —
 *   ein Titelindex fehlt), `volltext` im Volltextindex über alle Chunks.
 * - Antworten der Landesregierung tragen als Urheber nur die Landesregierung,
 *   nicht die fragende Fraktion: bei einem Fraktionsfilter bleiben sie
 *   ungefiltert in der Liste, und der Hinweis sagt es.
 */
import { type LandtagFilter } from '@gruenerator/contracts';

import { type Deadline } from '../../../utils/deadline.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { type LandtagFindResult } from '../berlin/find.js';
import { LANDTAGE, type ResolvedLandtagFilter, resolveFilters } from '../registry.js';

import {
  dedupeNrw,
  type NrwCondition,
  type NrwFilter,
  type NrwNotebook,
  NRW_WAHLPERIODE,
} from './notebook.js';

export const MAX_CANDIDATES = 25;
/** Soviele Chunks holt die dichte Suche; mehrere Chunks eines Dokuments fallen beim Entdoppeln weg. */
const NEAREST_CHUNKS = 120;
/** Ohne Chunk-0-Bindung (Volltext) kommen Dokumente mehrfach; soviele Chunks reichen für 25 Dokumente. */
const LATEST_CHUNKS = 200;

function buildFilter(f: ResolvedLandtagFilter): { filter: NrwFilter; perDocument: boolean } {
  const must: NrwCondition[] = [{ key: 'content_type', match: { value: 'drucksache' } }];
  if (f.typen.length > 0) must.push({ key: 'doc_type', match: { any: f.typen } });
  if (f.fraktionen.length > 0) {
    const party: NrwCondition = { key: 'party', match: { any: f.fraktionen } };
    // Antworten ohne fragende Fraktion bleiben drin, wenn sie gefragt sind.
    must.push(
      f.typen.includes('Antwort')
        ? { should: [party, { key: 'doc_type', match: { value: 'Antwort' } }] }
        : party
    );
  }
  if (f.datumVon || f.datumBis) {
    // `published_at` ist ein Tagesdatum; Qdrant liest es wie die Grenzen als Mitternacht UTC.
    must.push({
      key: 'published_at',
      range: {
        ...(f.datumVon ? { gte: f.datumVon } : {}),
        ...(f.datumBis ? { lte: f.datumBis } : {}),
      },
    });
  }
  if (f.titel) must.push({ key: 'chunk_text', match: { text: f.titel } });
  if (f.volltext) must.push({ key: 'chunk_text', match: { text: f.volltext } });
  // Der Titel steht nur im Kopf von Chunk 0; ohne Volltext reicht Chunk 0 für alles.
  const perDocument = !!f.titel || !f.volltext;
  if (perDocument) must.push({ key: 'chunk_index', match: { value: 0 } });
  return { filter: { must }, perDocument };
}

export async function findNrw(
  args: { query: string; filters: LandtagFilter; deadline?: Deadline | null },
  notebook: NrwNotebook
): Promise<LandtagFindResult> {
  const meta = LANDTAGE.nrw;
  const f = resolveFilters(meta, args.filters);
  const notes = [...f.notes];
  if (f.empty) return { candidates: [], gesamt: 0, notes, ausgeschlossen: f.empty };
  if (f.wahlperiode != null && f.wahlperiode !== NRW_WAHLPERIODE) {
    return {
      candidates: [],
      gesamt: 0,
      notes,
      ausgeschlossen: `Für den ${meta.parlament} liegt nur die ${NRW_WAHLPERIODE}. Wahlperiode (seit 2022) vor.`,
    };
  }

  const query = args.query.trim();
  const { filter, perDocument } = buildFilter(f);
  const lookup = Promise.all([
    query
      ? notebook.nearest(query, filter, NEAREST_CHUNKS)
      : notebook.latest(filter, perDocument ? MAX_CANDIDATES : LATEST_CHUNKS),
    // Gezählt werden Dokumente, also nur mit Chunk-0-Bindung.
    perDocument ? notebook.count(filter) : Promise.resolve(null),
  ]);
  // Das Notebook ist hier die einzige Quelle: es bekommt die ganze Restzeit, keinen Anteil.
  const [payloads, gesamt] = args.deadline
    ? await withTimeout(lookup, args.deadline.remainingMs(), 'landtag-nrw')
    : await lookup;
  const candidates = dedupeNrw(payloads).slice(0, MAX_CANDIDATES);

  if (f.mitAnfrage) {
    notes.push(
      'Kleine Anfragen liegen nur zusammen mit der Antwort der Landesregierung vor; die Antwort zitiert die Fragen wörtlich.'
    );
  }
  if (f.fraktionen.length > 0) {
    notes.push(
      f.typen.includes('Antwort')
        ? 'Antworten der Landesregierung tragen keine fragende Fraktion und stehen ungefiltert in der Liste.'
        : 'Antworten auf Kleine Anfragen tragen keine fragende Fraktion und fehlen bei einem Fraktionsfilter.'
    );
  }
  if (query && candidates.length > 0) {
    notes.push(
      `Sortiert nach inhaltlicher Nähe zu „${query}“, nicht nach Datum${
        gesamt != null ? `; die Filter treffen etwa ${gesamt} Drucksachen` : ''
      }.`
    );
  } else if (gesamt != null && gesamt > candidates.length) {
    notes.push(
      `Gezeigt werden die neuesten ${candidates.length} von ${gesamt} Drucksachen; mit Zeitraum, Titel, Art oder einem Thema (query) eingrenzen.`
    );
  }
  // Mit Thema zählt `gesamt` nur die Filter, nicht das Thema: als Gesamtzahl taugt dann nur die Liste.
  return { candidates, gesamt: query ? candidates.length : (gesamt ?? candidates.length), notes };
}
