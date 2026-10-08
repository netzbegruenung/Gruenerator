/**
 * Abhängige Dokumente folgen ihrem Ursprung in die Trefferliste.
 *
 * Ein Entschließungsantrag im Landtag NRW wird „zu" einer Drucksache
 * eingereicht und unter deren Tagesordnungspunkt beraten, trägt aber meist
 * einen eigenen Titel und klingt anders. Seine eigene Ähnlichkeit zur Frage ist
 * deshalb oft schwach, obwohl er fest zum Thema gehört. Steht sein Ursprung
 * unter den Treffern, rückt er direkt dahinter.
 *
 * Gemessen am Bestand (Oktober 2026, 118 Entschließungsanträge, Frage aus ihren
 * Schlagworten, erste zehn Dokumente aus 60 Chunks): 43 → 68. An 100
 * unabhängigen Fragen zu anderen Drucksachen und Protokollen änderte sich
 * nichts. Zahlen und Herleitung: #4307.
 *
 * Der Platz, nicht der Wert: auf Sammlungen mit Sparse-Vektoren ist
 * `similarity_score` ein Fusionswert und kein Kosinus, ein fester Abschlag hätte
 * dort keine Bedeutung. Das abhängige Dokument bekommt den Wert seines
 * Ursprungs knapp unterschritten, damit jede spätere Sortierung die Reihenfolge
 * hält. Den gemessenen Kosinus des Ursprungs erbt es aus demselben Grund: ohne
 * ihn fiele es beim Notebook-Schnitt (`dense_similarity ?? similarity`) auf den
 * Fusionswert zurück. Höher als der Ursprung steht es nie, `evidenceTop`
 * bleibt also unberührt.
 */

import { type QdrantOperations } from '../../../database/services/QdrantOperations.js';
import { type QdrantFilter } from '../../../database/services/QdrantService/types.js';
import { type DocumentResult } from '../../BaseSearchService/types.js';

/** Mehr hängen selten an einem Ursprung; Ausreißer (Wahlvorschläge) sollen die Liste nicht füllen. */
export const MAX_DEPENDENTS_PER_ORIGIN = 3;
const BELOW_ORIGIN = 1e-6;
const PREVIEW_CHARS = 300;

export interface DependentPoint {
  document_id: string;
  /** Drucksachennummer des Ursprungs. */
  bezug: string;
  title: string;
  source_url: string | null;
  published_at: string | null;
  content_type: string | null;
  chunk_text: string;
}

function dependentResult(
  dep: DependentPoint,
  origin: DocumentResult,
  rank: number
): DocumentResult {
  const below = BELOW_ORIGIN * (rank + 1);
  return {
    document_id: dep.document_id,
    title: dep.title,
    ...(dep.source_url ? { source_url: dep.source_url } : {}),
    published_at: dep.published_at,
    relevant_content: dep.chunk_text,
    similarity_score: origin.similarity_score - below,
    dense_similarity_score:
      typeof origin.dense_similarity_score === 'number'
        ? origin.dense_similarity_score - below
        : null,
    max_similarity: origin.similarity_score - below,
    avg_similarity: origin.similarity_score - below,
    chunk_index: 0,
    top_chunks: [
      {
        chunk_index: 0,
        content_type: dep.content_type,
        preview: dep.chunk_text.slice(0, PREVIEW_CHARS),
        text: dep.chunk_text,
      },
    ],
    chunk_count: 1,
    term_chunk_count: 0,
    relevance_info: `Gehört zu „${origin.title ?? origin.document_id}"`,
    search_methods: ['dependent'],
  };
}

/**
 * Setzt hinter jeden Ursprung bis zu {@link MAX_DEPENDENTS_PER_ORIGIN} seiner
 * abhängigen Dokumente, neueste zuerst. Ein abhängiges Dokument, das schon
 * weiter oben steht, bleibt dort; eines, das weiter unten steht, rückt herauf.
 * Danach wird wieder auf `limit` gekürzt.
 */
export function insertDependents(
  results: readonly DocumentResult[],
  originNumbers: ReadonlyMap<string, string>,
  dependents: readonly DependentPoint[],
  limit: number
): DocumentResult[] {
  const byOrigin = new Map<string, DependentPoint[]>();
  for (const dep of dependents) {
    byOrigin.set(dep.bezug, [...(byOrigin.get(dep.bezug) ?? []), dep]);
  }
  for (const list of byOrigin.values()) {
    list.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }

  const out: DocumentResult[] = [];
  const placed = new Set<string>();
  for (const result of results) {
    if (placed.has(result.document_id)) continue;
    out.push(result);
    placed.add(result.document_id);

    const number = originNumbers.get(result.document_id);
    const list = number ? (byOrigin.get(number) ?? []) : [];
    let rank = 0;
    for (const dep of list) {
      if (rank >= MAX_DEPENDENTS_PER_ORIGIN) break;
      if (placed.has(dep.document_id)) continue;
      out.push(dependentResult(dep, result, rank));
      placed.add(dep.document_id);
      rank += 1;
    }
  }
  return out.slice(0, limit);
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Holt zu den Treffern die abhängigen Dokumente und setzt sie ein. Zwei
 * Abfragen über indexierte Felder; Chunk 0 trägt den Volltext, deshalb wird nur
 * gelesen, was gebraucht wird.
 *
 * Ursprung kann nur eine Drucksache sein: Protokolle führen eigene Nummern
 * (Plenarprotokoll 18/40), die mit Drucksachennummern kollidieren.
 *
 * `additionalFilter` sind die aktiven Filter der Suche (Fraktion, Zeitraum,
 * Dokumentart …) — ein abhängiges Dokument, das sie nicht erfüllt, kommt nicht dazu.
 */
export async function expandDependents(
  qdrantOps: QdrantOperations,
  collection: string,
  dependentDocTypes: readonly string[],
  results: readonly DocumentResult[],
  additionalFilter: QdrantFilter | null,
  limit: number
): Promise<DocumentResult[]> {
  if (results.length === 0) return [...results];

  const origins = await qdrantOps.scrollDocuments(
    collection,
    {
      must: [
        { key: 'document_id', match: { any: results.map((r) => r.document_id) } },
        { key: 'chunk_index', match: { value: 0 } },
        { key: 'content_type', match: { value: 'drucksache' } },
      ],
    },
    { limit: results.length, withPayload: ['document_id', 'document_number'] }
  );
  const originNumbers = new Map<string, string>();
  for (const p of origins) {
    const id = str(p.payload.document_id);
    const number = str(p.payload.document_number);
    if (id && number) originNumbers.set(id, number);
  }
  if (originNumbers.size === 0) return [...results];

  const found = await qdrantOps.scrollDocuments(
    collection,
    {
      must: [
        { key: 'bezug', match: { any: [...originNumbers.values()] } },
        { key: 'doc_type', match: { any: [...dependentDocTypes] } },
        { key: 'chunk_index', match: { value: 0 } },
        ...(additionalFilter?.must ?? []),
      ],
    },
    {
      limit: originNumbers.size * 10,
      withPayload: [
        'document_id',
        'bezug',
        'title',
        'source_url',
        'published_at',
        'content_type',
        'chunk_text',
      ],
    }
  );
  const dependents: DependentPoint[] = [];
  for (const p of found) {
    const id = str(p.payload.document_id);
    const bezug = str(p.payload.bezug);
    if (!id || !bezug) continue;
    dependents.push({
      document_id: id,
      bezug,
      title: str(p.payload.title) ?? id,
      source_url: str(p.payload.source_url),
      published_at: str(p.payload.published_at),
      content_type: str(p.payload.content_type),
      chunk_text: str(p.payload.chunk_text) ?? '',
    });
  }
  return insertDependents(results, originNumbers, dependents, limit);
}
