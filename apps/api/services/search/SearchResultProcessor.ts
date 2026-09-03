/**
 * SearchResultProcessor - Shared utilities for processing search results
 *
 * Consolidates search result processing logic:
 * - Expansion and deduplication
 * - Citation and reference building
 * - Source grouping by collection
 */

import { vectorConfig } from '../../config/vectorConfig.js';
import { PROMPT_SOURCE_MAX_CHARS } from '../document-services/TextChunker/chunkBudget.js';

import { recencyBoost, resolveSourceDate } from './recency.js';
import { selectRelevantExcerpt } from './relevantExcerpt.js';

import type {
  SearchResultInput,
  ExpandedChunkResult,
  ReferenceData,
  ReferencesMap,
  Citation,
  Source,
  ValidationResult,
  FilterOptions,
  CollectionConfig,
  SourcesByCollection,
} from './types.js';

/**
 * Expand document search results into individual chunk results
 */
export function expandResultsToChunks(
  results: SearchResultInput[],
  collectionId: string | null = null,
  collectionName: string | null = null
): ExpandedChunkResult[] {
  const expanded: ExpandedChunkResult[] = [];

  for (const r of results) {
    const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
    const topChunks = r.top_chunks || [];
    const sourceUrl = r.source_url || r.url || null;
    const docId = r.document_id || sourceUrl || '';

    const publishedAt = r.published_at ?? null;
    const createdAt = r.created_at;

    if (topChunks.length > 0) {
      for (const chunk of topChunks) {
        expanded.push({
          document_id: docId,
          source_url: sourceUrl,
          source_id: r.source_id ?? null,
          title,
          snippet: chunk.preview || '',
          ...(chunk.text && { chunk_text: chunk.text }),
          filename: r.filename || null,
          similarity: r.similarity_score || 0,
          ...(r.dense_similarity_score != null && {
            dense_similarity: r.dense_similarity_score,
          }),
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number ?? null,
          chunk_type: chunk.chunk_type ?? null,
          published_at: publishedAt,
          ...(createdAt && { created_at: createdAt }),
          ...(collectionId && { collection_id: collectionId }),
          ...(collectionName && { collection_name: collectionName }),
        });
      }
    } else {
      expanded.push({
        document_id: docId,
        source_url: sourceUrl,
        source_id: r.source_id ?? null,
        title,
        snippet: r.relevant_content || r.chunk_text || '',
        ...(r.chunk_text && { chunk_text: r.chunk_text }),
        filename: r.filename || null,
        similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
        ...(r.dense_similarity_score != null && {
          dense_similarity: r.dense_similarity_score,
        }),
        chunk_index: r.chunk_index || 0,
        page_number: null,
        chunk_type: null,
        published_at: publishedAt,
        ...(createdAt && { created_at: createdAt }),
        ...(collectionId && { collection_id: collectionId }),
        ...(collectionName && { collection_name: collectionName }),
      });
    }
  }

  return expanded;
}

/**
 * Deduplicate results by document ID and chunk index
 */
export function deduplicateResults(
  results: ExpandedChunkResult[],
  includeCollectionInKey: boolean = false
): ExpandedChunkResult[] {
  const keySet = new Set<string>();
  const deduped: ExpandedChunkResult[] = [];

  for (const r of results) {
    const key = includeCollectionInKey
      ? `${r.collection_id}:${r.document_id}:${r.chunk_index}`
      : `${r.document_id}:${r.chunk_index}`;

    if (keySet.has(key)) continue;
    keySet.add(key);
    deduped.push(r);
  }

  return deduped;
}

/**
 * Build references map from search results for citation processing.
 *
 * `date` is the source's real publication date (or upload date when
 * `allowCreatedAt` is set for user collections), or null when none — NOT the
 * response timestamp. Consumed by the answer prompt and returned in citations.
 */
export function buildReferencesMap(
  results: ExpandedChunkResult[],
  options: { allowCreatedAt?: boolean | undefined } = {}
): ReferencesMap {
  const referencesMap: ReferencesMap = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const id = String(i + 1);

    referencesMap[id] = {
      title: r.title,
      snippets: [[r.snippet]],
      ...(r.chunk_text && { chunk_text: r.chunk_text }),
      description: null,
      date: resolveSourceDate(r, { allowCreatedAt: options.allowCreatedAt }),
      source: 'qa_documents',
      document_id: r.document_id,
      source_url: r.source_url || null,
      filename: r.filename,
      similarity_score: r.similarity,
      chunk_index: r.chunk_index,
      page_number: r.page_number,
      chunk_type: r.chunk_type ?? null,
      ...(r.collection_id && { collection_id: r.collection_id }),
      ...(r.collection_name && { collection_name: r.collection_name }),
    };
  }

  return referencesMap;
}

/**
 * Per-source budget for prompt context.
 *
 * Chunks target ~1600 characters and a table chunk is capped at exactly this
 * number (`TABLE_CHUNK_MAX_CHARS`), so this passes a retrieved chunk through
 * whole in the ordinary case. The previous 300/400-character cut meant a model
 * asked to quote a passage, name a speaker or read a figure was working from
 * the chunk's opening sentences while the sentence that matched the query sat
 * in the discarded remainder.
 *
 * The number itself lives in `chunkBudget.ts`, next to the chunk sizes it caps.
 */
export { PROMPT_SOURCE_MAX_CHARS };

/**
 * The text of a source as the model should see it: the full chunk when the
 * search layer supplied one, falling back to the display snippet.
 *
 * Eine Tabelle IST ihre Zeilenstruktur. `\s+ → ' '` macht aus einem sauber
 * geschnittenen Tabellen-Chunk eine Zeile, in der keine Zelle mehr einer Spalte
 * zuzuordnen ist — die ganze Arbeit der Blockzerlegung käme so nie beim Modell
 * an. Deshalb behalten `chunk_type: 'table'`-Referenzen ihre Zeilenumbrüche;
 * innerhalb einer Zeile wird weiter normalisiert.
 */
export function sourceTextForPrompt(
  ref: ReferenceData,
  maxChars: number = PROMPT_SOURCE_MAX_CHARS
): string {
  const text = ref.chunk_text || ref.snippets[0]?.[0] || '';
  const clipped = text.slice(0, maxChars);

  if (ref.chunk_type === 'table') {
    const lines = clipped
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line) => line.length > 0);

    // Ein Schnitt bei `maxChars` landet mitten in einer Zeile. Eine halbe
    // Tabellenzeile ordnet keine Zelle mehr einer Spalte zu — sie fällt weg,
    // statt dem Modell eine abgeschnittene Zahl als ganze anzubieten. Ob die
    // Zeile ganz ist, sagt nur die Schnittstelle selbst: ein Schnitt hinter
    // einem inneren `|` hinterlässt eine Zeile, die sauber auf `|` endet und
    // trotzdem Spalten verloren hat.
    const cutOnLineBoundary = clipped.endsWith('\n') || text.charAt(maxChars) === '\n';
    if (text.length > maxChars && lines.length > 1 && !cutOnLineBoundary) {
      lines.pop();
    }

    return lines.join('\n').trim();
  }

  return clipped.replace(/\s+/g, ' ').trim();
}

/**
 * Drop the prompt-only fields before a result goes over the wire.
 *
 * `chunk_text` exists so the answer prompt and the reranker can read the whole
 * retrieved chunk; the client's citation list is served by `snippet`. Emitting
 * it would put roughly 1.5 KB per source into every completion event for a
 * field nothing on the other side reads.
 */
export function toClientSource(result: ExpandedChunkResult): ExpandedChunkResult {
  const { chunk_text: _chunkText, ...rest } = result;
  return rest;
}

/**
 * Validate draft content and inject citation markers
 */
export function validateAndInjectCitations(
  draft: string,
  referencesMap: ReferencesMap,
  options: { question?: string } = {}
): ValidationResult {
  const validIds = new Set(Object.keys(referencesMap));
  const errors: string[] = [];

  let content = draft.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/m, '$1');

  content = content.replace(/\n+Quellen:[\s\S]*$/i, '');

  content = content.replace(/\[(\s*\d+(?:\s*,\s*\d+)+\s*)\]/g, (_m: string, inner: string) => {
    const nums: string[] = inner
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    return nums.map((n: string) => `[${n}]`).join('');
  });

  const usedIds = new Set<string>();
  const citationPattern = /\[(\d+)\]/g;
  let match;

  while ((match = citationPattern.exec(content)) !== null) {
    const n = match[1];
    if (validIds.has(n)) {
      usedIds.add(n);
    } else {
      errors.push(`Invalid citation [${n}]`);
    }
  }

  for (const id of usedIds) {
    const re = new RegExp(`\\[${id}\\]`, 'g');
    content = content.replace(re, `[cite:${id}]`);
  }

  // Dieselbe Decke wie die Suchvorschau (`CONTENT_MAX_EXCERPT_LENGTH`, 1500):
  // der Ausschnitt wird VERSCHOBEN, nicht gekürzt. Ein engerer Deckel hier
  // kostet zweimal — einmal in der Karte und einmal im nächsten Zug, denn
  // `notebookHistoryService` trägt `cited_text` als `chunk_text` weiter.
  const citedTextMaxChars = vectorConfig.get('content').maxExcerptLength;
  const citations: Citation[] = [...usedIds].map((id) => {
    const ref = referencesMap[id];
    const head = ref.snippets[0]?.[0] || '';
    const excerpt =
      options.question && ref.chunk_text
        ? selectRelevantExcerpt(ref.chunk_text, options.question, citedTextMaxChars, 'contiguous')
        : null;
    // `null` heisst: der Chunk passt unter die Decke, oder die Frage trägt kein
    // Signal — im zweiten Fall bleibt der Fallback unter der Decke gekappt,
    // statt den ganzen (womöglich mehrere-KB-langen) Chunk zu zitieren.
    const citedText =
      excerpt?.text ??
      (options.question && ref.chunk_text ? ref.chunk_text.slice(0, citedTextMaxChars) : head);
    return {
      index: id,
      cited_text: citedText,
      document_title: ref.title,
      document_id: ref.document_id,
      source_url: ref.source_url || null,
      similarity_score: ref.similarity_score,
      chunk_index: ref.chunk_index,
      filename: ref.filename,
      page_number: ref.page_number,
      date: ref.date ?? null,
      ...(ref.collection_id && { collection_id: ref.collection_id }),
      ...(ref.collection_name && { collection_name: ref.collection_name }),
    };
  });

  const byDoc = new Map<
    string,
    {
      document_id: string;
      document_title: string;
      source_url: string | null;
      date: string | null;
      chunk_texts: string[];
      similarity_scores: number[];
      citations: Citation[];
    }
  >();

  for (const c of citations) {
    const key = c.document_id || c.document_title;
    if (!byDoc.has(key)) {
      byDoc.set(key, {
        document_id: c.document_id,
        document_title: c.document_title,
        source_url: c.source_url || null,
        date: c.date ?? null,
        chunk_texts: [c.cited_text],
        similarity_scores: [c.similarity_score],
        citations: [],
      });
    } else {
      const doc = byDoc.get(key)!;
      doc.chunk_texts.push(c.cited_text);
      doc.similarity_scores.push(c.similarity_score);
      if (!doc.date && c.date) doc.date = c.date;
    }
    byDoc.get(key)!.citations.push(c);
  }

  const sources: Source[] = [...byDoc.values()].map((source) => ({
    document_id: source.document_id,
    document_title: source.document_title,
    source_url: source.source_url || null,
    chunk_text: source.chunk_texts.join(' [...] '),
    similarity_score: Math.max(...source.similarity_scores),
    date: source.date,
    citations: source.citations,
  }));

  return {
    cleanDraft: content,
    citations,
    sources,
    errors: errors.length > 0 ? errors : null,
  };
}

/**
 * Inline citation markers, single (`[1]`) and grouped (`[1, 3]`). Mirrors the
 * pattern the chat renderer matches on
 * (packages/chat CitationMarkdownText), because a marker form the renderer
 * shows but this scanner misses would be renumbered inconsistently: its ids
 * would count as uncited, drop out of the map, and keep their stale numbers.
 * Rebuilt per use — a shared /g regex carries `lastIndex` between calls.
 */
const CITATION_MARKER_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function splitMarkerIds(inner: string): string[] {
  return inner.split(',').map((id) => id.trim());
}

/**
 * Renumber citations in order of appearance for logical UX.
 *
 * Generic over the map value so the chat's `Citation` shape can reuse it —
 * `ReferencesMap` still infers as `Record<string, ReferenceData>`, so the
 * notebook callers are unaffected. Uncited entries are dropped: an id the draft
 * never references has no marker left to point at it.
 */
export function renumberCitationsInOrder<T>(
  draft: string,
  originalReferencesMap: Record<string, T>
): { renumberedDraft: string; newReferencesMap: Record<string, T> } {
  const seenOrder: string[] = [];
  let match;

  const scan = new RegExp(CITATION_MARKER_PATTERN);
  while ((match = scan.exec(draft)) !== null) {
    for (const id of splitMarkerIds(match[1])) {
      if (!seenOrder.includes(id) && originalReferencesMap[id]) {
        seenOrder.push(id);
      }
    }
  }

  const oldToNew: { [oldId: string]: string } = {};
  seenOrder.forEach((oldId, index) => {
    oldToNew[oldId] = String(index + 1);
  });

  // Whole markers are rewritten in one pass, so an old id can never collide with
  // a new one and no placeholder round-trip is needed. Markers whose ids are all
  // unknown stay verbatim — an out-of-range id the model invented is a separate
  // problem from renumbering, and silently deleting text here would hide it.
  const renumberedDraft = draft.replace(
    new RegExp(CITATION_MARKER_PATTERN),
    (full, inner: string) => {
      const mapped = splitMarkerIds(inner)
        .map((id) => oldToNew[id])
        .filter((id): id is string => !!id);
      return mapped.length > 0 ? `[${mapped.join(', ')}]` : full;
    }
  );

  const newReferencesMap: Record<string, T> = {};
  for (const [oldId, newId] of Object.entries(oldToNew)) {
    const ref = originalReferencesMap[oldId];
    if (ref !== undefined) newReferencesMap[newId] = ref;
  }

  return { renumberedDraft, newReferencesMap };
}

/**
 * Sort results by similarity, with a mild recency boost as a secondary factor.
 *
 * Der Schnitt läuft auf `dense_similarity ?? similarity` (#3166): auf einer
 * server-seitig fusionierten Sammlung ist `similarity` ein Fusionswert, und
 * die Konstante 0,35 ist als Kosinus geschrieben — RRF liegt auf Rang 1 bei
 * ≈ 1,0, DBSF läuft nahe 0 aus, dieselbe Zahl schneidet je Arm einen anderen
 * Anteil weg. SORTIERT wird weiter auf `similarity`: der Fusionswert bleibt
 * das Ranking-Signal, neu ist ausschliesslich, worauf geschnitten wird.
 *
 * Der Rückfall ist Pflicht, nicht Vorsicht — aber NICHT weil dem Alt-Pfad ein
 * Kosinus fehlt (er hat einen pro Chunk). `dense_similarity` wird
 * absichtlich NUR aus dem server-seitigen Score-Join befüllt (Fix-Runde 1):
 * auf dem Alt-Pfad trägt `similarity` bereits Begriffstreffer-, Diversitäts-
 * und Hybrid-Boni oben auf dem Kosinus, die dieses Feld nicht kennt — ein
 * Schnitt gegen den unboosteten Kosinus dort würde die 42 Alt-Kontrollfälle
 * verschieben, die dieser Umbau explizit unverändert lassen soll.
 *
 * The gate runs on `dense_similarity ?? similarity`, never on the
 * recency-boosted `effective()` — recency only re-orders sources that already
 * qualify, it never rescues a weak source. The boost is additive and small
 * (see recency.ts), so content quality stays decisive; dateless sources get
 * boost 0 and keep pure-similarity behaviour.
 */
export function filterAndSortResults(
  results: ExpandedChunkResult[],
  options: FilterOptions = {}
): ExpandedChunkResult[] {
  const {
    threshold = 0.35,
    limit = 40,
    now = new Date(),
    allowCreatedAt,
    maxPerDocument,
  } = options;

  const effective = (r: ExpandedChunkResult): number =>
    r.similarity + recencyBoost(resolveSourceDate(r, { allowCreatedAt }), now);

  const sorted = results
    .filter((r) => (r.dense_similarity ?? r.similarity) >= threshold)
    .sort((a, b) => effective(b) - effective(a));

  const capped = maxPerDocument ? capChunksPerDocument(sorted, maxPerDocument) : sorted;

  return capped.slice(0, limit);
}

/**
 * Zieht je `document_id` höchstens `maxPerDocument` Treffer nach vorn — die
 * Reihenfolge ist bereits nach Score sortiert, "zuerst" heisst also "bester" —
 * und hängt die übrigen dahinter an, statt sie zu verwerfen: der Kopf der Liste
 * wird vielfältig, der Kontext bleibt voll. Ein Notebook mit einem einzigen
 * Dokument bekommt so weiterhin alle seine Chunks. Ergebnisse ohne
 * `document_id` (leerer String, z. B. Web-Quellen ohne Dokumentbezug) werden
 * nie gedeckelt, es gibt dort kein Dokument, über das zu verteilen wäre.
 * `selectAcrossQueryGroups` führt beim Mischen seinen eigenen Zähler, weil der
 * Deckel dort über Gruppen hinweg gilt.
 */
function capChunksPerDocument(
  results: ExpandedChunkResult[],
  maxPerDocument: number
): ExpandedChunkResult[] {
  const counts = new Map<string, number>();
  const head: ExpandedChunkResult[] = [];
  const overflow: ExpandedChunkResult[] = [];
  for (const r of results) {
    const count = r.document_id ? (counts.get(r.document_id) ?? 0) : 0;
    if (r.document_id && count >= maxPerDocument) {
      overflow.push(r);
      continue;
    }
    if (r.document_id) counts.set(r.document_id, count + 1);
    head.push(r);
  }
  return [...head, ...overflow];
}

/**
 * Pick results across several DISTINCT questions, giving each a share of the
 * budget instead of letting absolute scores decide alone.
 *
 * Needed for decomposed batch questions. Flattening first and cutting at
 * `limit` sorts sub-questions against each other, so a part whose evidence
 * simply scores lower — a name in a side clause against a headline figure —
 * loses every one of its chunks and gets answered with "not in the sources"
 * while its chunk sat just below the cut. Round-robin gives each part its turn
 * before any part gets a second chunk; leftover slots still go by score.
 *
 * One group per question, NOT per query string: rewordings of one question
 * belong in a single group. Splitting them would hand a fair share to each
 * phrasing, letting a weak hit from a worse rewording take a slot from a
 * stronger hit of the best one — the opposite of what fairness is for here.
 *
 * With one group this is exactly `filterAndSortResults`, so the ordinary
 * single-question path is unchanged at every depth tier.
 */
export function selectAcrossQueryGroups(
  groups: ExpandedChunkResult[][],
  options: FilterOptions = {}
): ExpandedChunkResult[] {
  const nonEmpty = groups.filter((g) => g.length > 0);
  if (nonEmpty.length <= 1) {
    return filterAndSortResults(nonEmpty[0] ?? [], options);
  }

  const { limit = 40, maxPerDocument, ...rest } = options;
  const ranked = nonEmpty.map((g) =>
    filterAndSortResults(g, { ...rest, maxPerDocument, limit: Infinity })
  );

  const selected: ExpandedChunkResult[] = [];
  const seen = new Set<string>();
  // Per-Gruppe deckelt filterAndSortResults oben bereits, aber ein Dokument
  // kann in ZWEI Gruppen vorne liegen — dieser zweite Zähler deckelt die
  // gemergte Auswahl, den Fall, den der Gruppen-Deckel allein nicht sieht.
  const docCounts = new Map<string, number>();
  // Was der Deckel übergeht, kommt hinten wieder dran (siehe capChunksPerDocument).
  const overflow: ExpandedChunkResult[] = [];
  const cursors = ranked.map(() => 0);

  let progressed = true;
  while (selected.length < limit && progressed) {
    progressed = false;
    for (let g = 0; g < ranked.length && selected.length < limit; g++) {
      const group = ranked[g] ?? [];
      let cursor = cursors[g] ?? 0;
      while (cursor < group.length) {
        const candidate = group[cursor];
        cursor += 1;
        if (!candidate) continue;
        // Same identity as deduplicateResults — skip what another group took.
        const key = `${candidate.collection_id ?? ''}:${candidate.document_id}:${candidate.chunk_index}`;
        if (seen.has(key)) continue;
        if (maxPerDocument && candidate.document_id) {
          const docCount = docCounts.get(candidate.document_id) ?? 0;
          if (docCount >= maxPerDocument) {
            overflow.push(candidate);
            continue;
          }
        }
        seen.add(key);
        if (candidate.document_id) {
          docCounts.set(candidate.document_id, (docCounts.get(candidate.document_id) ?? 0) + 1);
        }
        selected.push(candidate);
        progressed = true;
        break;
      }
      cursors[g] = cursor;
    }
  }

  for (const candidate of overflow) {
    if (selected.length >= limit) break;
    const key = `${candidate.collection_id ?? ''}:${candidate.document_id}:${candidate.chunk_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(candidate);
  }

  return selected;
}

/**
 * Group sources by collection for multi-collection responses
 */
export function groupSourcesByCollection(
  citations: Citation[],
  allResults: ExpandedChunkResult[],
  collectionsConfig: { [collectionId: string]: CollectionConfig }
): SourcesByCollection {
  const sourcesByCollection: SourcesByCollection = {};

  for (const [collectionId, config] of Object.entries(collectionsConfig)) {
    const collectionCitations = citations.filter((c) => c.collection_id === collectionId);
    const collectionResults = allResults.filter((r) => r.collection_id === collectionId);
    const citedDocChunks = new Set(
      collectionCitations.map((c) => `${c.document_id}:${c.chunk_index}`)
    );

    const byDoc = new Map<
      string,
      {
        document_id: string;
        document_title: string;
        source_url: string | null;
        date: string | null;
        chunk_texts: string[];
        similarity_scores: number[];
        citations: Citation[];
      }
    >();

    for (const c of collectionCitations) {
      const key = c.document_id || c.document_title;
      if (!byDoc.has(key)) {
        byDoc.set(key, {
          document_id: c.document_id,
          document_title: c.document_title,
          source_url: c.source_url || null,
          date: c.date ?? null,
          chunk_texts: [c.cited_text],
          similarity_scores: [c.similarity_score],
          citations: [],
        });
      } else {
        const doc = byDoc.get(key)!;
        doc.chunk_texts.push(c.cited_text);
        doc.similarity_scores.push(c.similarity_score);
        if (!doc.date && c.date) doc.date = c.date;
      }
      byDoc.get(key)!.citations.push(c);
    }

    const sources: Source[] = [...byDoc.values()].map((source) => ({
      document_id: source.document_id,
      document_title: source.document_title,
      source_url: source.source_url || null,
      chunk_text: source.chunk_texts.join(' [...] '),
      similarity_score: Math.max(...source.similarity_scores),
      date: source.date,
      citations: source.citations,
    }));

    const allSources: ExpandedChunkResult[] = collectionResults
      .filter((r) => !citedDocChunks.has(`${r.document_id}:${r.chunk_index}`))
      .map(toClientSource);

    sourcesByCollection[collectionId] = {
      name: config.name,
      sources,
      allSources,
    };
  }

  return sourcesByCollection;
}

/**
 * Parse AI JSON response with code fence stripping and fallback
 */
export function parseAIJsonResponse(content: string, fallback: unknown = {}): unknown {
  try {
    if (!content) return fallback;
    const clean = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/g, '')
      .replace(/\*\*/g, '')
      .trim();
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}
