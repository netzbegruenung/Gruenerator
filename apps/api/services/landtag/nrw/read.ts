/**
 * Refs → Kandidaten und Kandidat → Text für den Landtag NRW, beides aus dem
 * Notebook: die Nummer über den Index auf `document_number`, der Text aus
 * `full_text` (kein PDF-Abruf, also auch kein Cache).
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';
import { type FetchedDoc } from '../../bundestag/qa/fetchTexts.js';

import { dedupeNrw, NRW_REF_RE, type NrwNotebook } from './notebook.js';

const log = createLogger('LandtagNrwRead');

/** Unbekannte Refs fallen still weg; der Aufrufer sieht an der Länge, was fehlt. */
export async function resolveNrwRefs(
  refs: readonly string[],
  notebook: NrwNotebook
): Promise<BundestagCandidate[]> {
  const unique = [...new Set(refs)];
  const nummern = unique.flatMap((ref) => {
    const m = NRW_REF_RE.exec(ref);
    return m ? [`${m[1]}/${m[2]}`] : [];
  });
  if (nummern.length === 0) return [];
  const payloads = await notebook.latest(
    {
      must: [
        { key: 'document_number', match: { any: nummern } },
        { key: 'content_type', match: { value: 'drucksache' } },
        { key: 'chunk_index', match: { value: 0 } },
      ],
    },
    nummern.length * 2
  );
  const found = new Map(dedupeNrw(payloads).map((c) => [c.ref, c]));
  return unique.flatMap((ref) => found.get(ref) ?? []);
}

/** Ergebnis in der Reihenfolge der Kandidaten; was nicht zu holen war, trägt `'missing'`. */
export async function fetchNrwTexts(
  candidates: readonly BundestagCandidate[],
  notebook: NrwNotebook
): Promise<FetchedDoc[]> {
  return Promise.all(
    candidates.map(async (c): Promise<FetchedDoc> => {
      try {
        const text = (await notebook.text(c.dipId)).trim();
        return text ? { ...c, text, textSource: 'pdf' } : { ...c, text: '', textSource: 'missing' };
      } catch (error: unknown) {
        log.warn(`Text nicht lesbar (${c.ref}): ${String(error)}`);
        return { ...c, text: '', textSource: 'missing' };
      }
    })
  );
}
