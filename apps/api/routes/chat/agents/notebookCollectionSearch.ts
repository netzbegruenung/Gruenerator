/**
 * `gruenerator_search` über die Abrufhälfte der Notebook-Suche.
 *
 * Bis 11/2026 suchte der Loop über `executeDirectSearch`: fünf Dokumente mit je
 * EINEM Ausschnitt. Die Notebook-Seite wägt für dieselbe Sammlung bis zu 100
 * Passagen ab — beste Stelle je Quelle, Teilfragen getrennt, Dubletten raus.
 * Ein Landesverbands-Agent ist ein Notebook mit Persona und Rezept; er bekam
 * trotzdem den dünnen Weg, und jede Verbesserung am Notebook-Abruf lief an ihm
 * vorbei. Jetzt fragen beide `getSearchContext`; nur das Budget unterscheidet
 * sich (`getLoopToolProfile`).
 *
 * Die Form des Ergebnisses bleibt `DirectSearchResult`, eine Zeile je QUELLE:
 * daran hängen die Quellenkarten, die `[N]`-Zitate (`toolCatalog` liest
 * `excerpt`) und die Wiederholung im nächsten Turn. Mehrere Passagen derselben
 * Quelle stehen deshalb gemeinsam in ihrem `excerpt`, nicht als eigene Zeilen
 * — sonst stünde dieselbe URL als zwei Quellen da.
 */
import { COLLECTION_MAP } from '../../../config/collectionMap.js';
import { getLoopToolProfile } from '../../../config/notebookDepthProfiles.js';
import { notebookQAService } from '../../../services/notebook/index.js';
import { rerankNotebookResults } from '../../../services/notebook/rerankNotebookResults.js';
import { createLogger } from '../../../utils/logger.js';

import { formatRelevance, truncateText } from './searchFormatting.js';

import type { DirectSearchResult } from './directSearch.js';
import type { ExpandedChunkResult } from '../../../services/search/types.js';

const log = createLogger('notebookCollectionSearch');

/** So viele Passagen einer Quelle stehen höchstens in ihrem `excerpt`. */
export const MAX_PASSAGES_PER_SOURCE = 3;
/**
 * Zeichen je Passage. Drei Passagen à 700 liegen mit Trennern knapp unter
 * `PROMPT_SOURCE_MAX_CHARS` (1800 + Rand) — was darüber hinausgeht, schnitte
 * der Antwort-Prompt ohnehin wieder ab.
 */
const PASSAGE_MAX_CHARS = 700;
const PASSAGE_SEPARATOR = '\n[…]\n';

export interface NotebookCollectionSearchParams {
  query: string;
  /** Der Schlüssel, den das Modell nannte — er steht im Ergebnis. */
  collection: string;
  /** Die Sammlungen dahinter: bei einem Bündel mehrere, sonst `[collection]`. */
  members: readonly string[];
  /** Höchstzahl QUELLEN (nicht Passagen). */
  limit: number;
  lvContentType?: readonly string[];
  rerankChunks?: boolean;
}

/** Quellen in Rangfolge, jede mit ihren Passagen in Rangfolge. */
function groupBySource(passages: ExpandedChunkResult[]): ExpandedChunkResult[][] {
  const groups = new Map<string, ExpandedChunkResult[]>();
  for (const p of passages) {
    const key = p.source_url || p.document_id;
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.values()];
}

export async function searchCollectionAsNotebook(
  params: NotebookCollectionSearchParams
): Promise<DirectSearchResult> {
  const { query, collection, members, limit, lvContentType, rerankChunks } = params;
  const mappings = members.flatMap((m) => {
    const mapping = COLLECTION_MAP[m];
    return mapping ? [mapping] : [];
  });
  const base = { collection, query, searchMode: 'hybrid' };
  if (mappings.length === 0) {
    return {
      ...base,
      resultsCount: 0,
      results: [],
      error: true,
      message: `Unbekannte Sammlung: ${collection}`,
    };
  }
  const systemIds = mappings.map((m) => m.systemId);

  // Wie bisher nur auf der Landesverbands-Sammlung: die anderen tragen kein
  // `content_type` oder ein anderes Vokabular, ein Filter dort leerte das
  // Ergebnis. Ein Bündel mischt Sammlungen und bekommt deshalb keinen.
  const contentTypeApplies =
    lvContentType !== undefined &&
    lvContentType.length > 0 &&
    mappings.length === 1 &&
    mappings[0] !== undefined &&
    'qdrantCollection' in mappings[0] &&
    mappings[0].qdrantCollection === 'landesverbaende_documents';

  try {
    const context = await notebookQAService.getSearchContext({
      question: query,
      ...(systemIds.length === 1 ? { collectionId: systemIds[0] } : { collectionIds: systemIds }),
      profile: getLoopToolProfile(),
      ...(contentTypeApplies ? { requestFilters: { content_type: [...lvContentType] } } : {}),
    });
    if (!context || context.sortedResults.length === 0) {
      log.info(`[Notebook Search] "${query}" in ${collection}: keine Treffer`);
      return { ...base, resultsCount: 0, results: [], message: 'Keine Ergebnisse gefunden.' };
    }

    let passages = context.sortedResults;
    let rerankDegraded = false;
    if (rerankChunks === true) {
      const reranked = await rerankNotebookResults({
        results: passages,
        referencesMap: context.referencesMap,
        question: query,
        mode: 'sort',
      });
      passages = reranked.results;
      rerankDegraded = !reranked.reranked;
    }

    const sources = groupBySource(passages).slice(0, limit);
    const results: DirectSearchResult['results'] = sources.map((group, index) => {
      const best = group[0]!;
      const excerpt = group
        .slice(0, MAX_PASSAGES_PER_SOURCE)
        .map((p) => truncateText(p.snippet, PASSAGE_MAX_CHARS))
        .join(PASSAGE_SEPARATOR);
      const date = best.date ?? best.published_at ?? null;
      return {
        rank: index + 1,
        relevance: formatRelevance(best.similarity),
        source: best.title || 'Unbekannte Quelle',
        ...(best.source_url ? { url: best.source_url } : {}),
        excerpt,
        searchMethod: 'hybrid',
        documentId: best.document_id,
        chunkIndex: best.chunk_index,
        score: best.similarity,
        // `publishedDate`, nicht `date`: so liest es die Quellen-Aufbereitung im
        // Katalog (`toolCatalog`), und nur so sieht das Modell, wie alt eine Quelle ist.
        ...(date ? { publishedDate: date } : {}),
        collectionId: collection,
      };
    });

    log.info(
      `[Notebook Search] "${query}" in ${collection}${contentTypeApplies ? ` contentType=${lvContentType.join(',')}` : ''}: ${results.length} Quellen aus ${passages.length} Passagen`
    );
    return {
      ...base,
      resultsCount: results.length,
      results,
      ...(rerankDegraded ? { rerankDegraded: true } : {}),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[Notebook Search] Fehler in ${collection}:`, message);
    return {
      ...base,
      resultsCount: 0,
      results: [],
      error: true,
      message: `Suche fehlgeschlagen: ${message}`,
    };
  }
}
