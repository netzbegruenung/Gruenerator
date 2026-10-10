/**
 * Abhängige Dokumente folgen ihrem Ursprung in die Trefferliste.
 *
 * Ein Entschließungsantrag im Landtag NRW gehört zum Verfahren (Vorgang) einer
 * Drucksache und wird unter deren Tagesordnungspunkt beraten, trägt aber meist
 * einen eigenen Titel und klingt anders. Seine eigene Ähnlichkeit zur Frage ist
 * deshalb oft schwach, obwohl er fest zum Thema gehört. Steht sein Ursprung
 * unter den Treffern, rückt er direkt dahinter.
 *
 * Gemessen am Bestand (Oktober 2026, 118 Entschließungsanträge, Frage aus ihren
 * Schlagworten, erste zehn Dokumente aus 60 Chunks): 43 → 68. An 100
 * unabhängigen Fragen zu anderen Drucksachen und Protokollen änderte sich
 * nichts. Zahlen und Herleitung: #4307.
 *
 * Verbunden wird über `vorgang_id` (Präfix der `record_id`), das alle Dokumente
 * eines Verfahrens teilen — auch solche ohne „zu … Drs" im Deskriptor, die
 * `bezug` nicht erfasst. Gemessen hat #4307 über `bezug`.
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
  /** Verfahren, zu dem das Dokument gehört. */
  vorgang_id: string;
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
  originVorgang: ReadonlyMap<string, string>,
  dependents: readonly DependentPoint[],
  limit: number
): DocumentResult[] {
  const byVorgang = new Map<string, DependentPoint[]>();
  for (const dep of dependents) {
    byVorgang.set(dep.vorgang_id, [...(byVorgang.get(dep.vorgang_id) ?? []), dep]);
  }
  for (const list of byVorgang.values()) {
    list.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }

  const out: DocumentResult[] = [];
  const placed = new Set<string>();
  for (const result of results) {
    if (placed.has(result.document_id)) continue;
    out.push(result);
    placed.add(result.document_id);

    const vorgang = originVorgang.get(result.document_id);
    const list = vorgang ? (byVorgang.get(vorgang) ?? []) : [];
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

const scrollDependents = (
  qdrantOps: QdrantOperations,
  collection: string,
  filter: QdrantFilter,
  limit: number
) =>
  qdrantOps.scrollDocuments(collection, filter, {
    limit,
    withPayload: [
      'document_id',
      'vorgang_id',
      'title',
      'source_url',
      'published_at',
      'content_type',
      'chunk_text',
    ],
  });

/**
 * Holt zu den Treffern die abhängigen Dokumente und setzt sie ein. Zwei
 * Abfragen über indexierte Felder, die zweite wiederholt sich nur, wenn ihr
 * Limit voll zurückkommt; Chunk 0 trägt den Volltext, deshalb wird nur
 * gelesen, was gebraucht wird.
 *
 * Ursprung kann nur eine Drucksache sein, die selbst keiner der abhängigen
 * Arten angehört: sonst zöge ein Entschließungsantrag seine Geschwister nach.
 *
 * `additionalFilter` sind die aktiven Filter der Suche (Fraktion, Zeitraum,
 * Dokumentart …), samt `must_not` und `should` — ein abhängiges Dokument, das
 * sie nicht erfüllt, kommt nicht dazu.
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
      must_not: [{ key: 'doc_type', match: { any: [...dependentDocTypes] } }],
    },
    { limit: results.length, withPayload: ['document_id', 'vorgang_id'] }
  );
  const originVorgang = new Map<string, string>();
  for (const p of origins) {
    const id = str(p.payload.document_id);
    const vorgang = str(p.payload.vorgang_id);
    if (id && vorgang) originVorgang.set(id, vorgang);
  }
  if (originVorgang.size === 0) return [...results];
  const vorgaenge = [...new Set(originVorgang.values())];

  const dependentFilter: QdrantFilter = {
    must: [
      { key: 'vorgang_id', match: { any: vorgaenge } },
      { key: 'doc_type', match: { any: [...dependentDocTypes] } },
      { key: 'chunk_index', match: { value: 0 } },
      ...(additionalFilter?.must ?? []),
    ],
    ...(additionalFilter?.must_not ? { must_not: additionalFilter.must_not } : {}),
    ...(additionalFilter?.should ? { should: additionalFilter.should } : {}),
  };
  // Erst alle holen, dann je Ursprung die neuesten nehmen: ein festes Gesamtlimit
  // könnte bei einem Ursprung mit vielen Abhängigen die der anderen verdrängen.
  // Kommt das Limit voll zurück, gab es womöglich mehr — dann größer nachfragen.
  let fetchLimit = vorgaenge.length * MAX_DEPENDENTS_PER_ORIGIN * 2;
  let found = await scrollDependents(qdrantOps, collection, dependentFilter, fetchLimit);
  while (found.length === fetchLimit) {
    fetchLimit *= 4;
    found = await scrollDependents(qdrantOps, collection, dependentFilter, fetchLimit);
  }
  const dependents: DependentPoint[] = [];
  for (const p of found) {
    const id = str(p.payload.document_id);
    const vorgang = str(p.payload.vorgang_id);
    if (!id || !vorgang) continue;
    dependents.push({
      document_id: id,
      vorgang_id: vorgang,
      title: str(p.payload.title) ?? id,
      source_url: str(p.payload.source_url),
      published_at: str(p.payload.published_at),
      content_type: str(p.payload.content_type),
      chunk_text: str(p.payload.chunk_text) ?? '',
    });
  }
  return insertDependents(results, originVorgang, dependents, limit);
}
