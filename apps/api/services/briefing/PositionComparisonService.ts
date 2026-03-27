import { generateText } from 'ai';

import { COLLECTION_LABELS } from '../../agents/langgraph/ChatGraph/nodes/citationUtils.js';
import { COLLECTION_MAP } from '../../config/collectionMap.js';
import { getSearchParams, applyDefaultFilter } from '../../config/systemCollectionsConfig.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { DocumentSearchService } from '../document-services/index.js';

import { getBriefingModel } from './aiProvider.js';

import type { CollectedItem } from './types.js';

const log = createLogger('PositionComparison');

const documentSearchService = new DocumentSearchService();

interface PositionSource {
  index: number;
  title: string;
  collection: string;
  collectionName: string;
  url: string | null;
  snippet: string;
  similarity: number;
}

interface RawPosition {
  topic: string;
  text: string;
  title: string;
  collection: string;
  url: string | null;
  similarity: number;
}

interface GreenPosition {
  topic: string;
  positions: Array<{ text: string; sourceIndex: number }>;
}

/**
 * Compares collected articles against Green party positions from Qdrant collections.
 *
 * Pipeline:
 * 1. Extract key topics from article content via Mistral
 * 2. Search actual Qdrant system collections for relevant Green positions per topic (parallel)
 * 3. Generate a structured comparison with [N] citation markers via Mistral
 * 4. Append numbered source list
 */
export async function compareWithPositions(
  items: CollectedItem[],
  collectionKeys: string[],
  customPrompt?: string
): Promise<string> {
  try {
    const topics = await extractTopics(items);
    if (topics.length === 0) {
      log.warn('No topics extracted from articles');
      return 'Keine vergleichbaren Themen in den Artikeln gefunden.';
    }

    const allSources: PositionSource[] = [];
    const greenPositions = await searchGreenPositions(topics, collectionKeys, allSources);

    const comparison = await generateComparison(items, greenPositions, allSources, customPrompt);

    if (allSources.length === 0) return comparison;

    const sourcesSection = allSources
      .map(
        (s) =>
          `[${s.index}] ${s.title} — ${s.collectionName} (Score: ${s.similarity.toFixed(2)})${s.url ? `\n    ${s.url}` : ''}`
      )
      .join('\n');

    return `${comparison}\n\n---\n\n## Quellen\n\n${sourcesSection}`;
  } catch (error) {
    log.error(`Position comparison failed: ${toError(error).message}`);
    return 'Positionsvergleich konnte nicht erstellt werden.';
  }
}

async function extractTopics(items: CollectedItem[]): Promise<string[]> {
  const articlesText = items
    .slice(0, 10)
    .map((item) => {
      const content = item.fullContent?.slice(0, 1000) || item.excerpt;
      return `Titel: ${item.title}\n${content}`;
    })
    .join('\n\n---\n\n');

  const result = await generateText({
    model: getBriefingModel(),
    system:
      'Du extrahierst die 3-5 wichtigsten politischen Themen aus Artikeln. Antworte NUR mit einer JSON-Liste von kurzen Suchbegriffen auf Deutsch, z.B. ["Gewerbesteuer Reform", "Digitalisierung Verwaltung", "Mindestlohn"]. Keine Erklärungen.',
    prompt: articlesText,
    temperature: 0.1,
    maxOutputTokens: 300,
  });

  const content = result.text;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const topics = Array.isArray(parsed) ? parsed : parsed.topics || parsed.themen || [];
    return topics.filter((t: unknown): t is string => typeof t === 'string').slice(0, 5);
  } catch {
    log.warn('Failed to parse topics JSON, extracting manually');
    const matches = content.match(/"([^"]+)"/g);
    return matches ? matches.map((m) => m.replace(/"/g, '')).slice(0, 5) : [];
  }
}

async function searchGreenPositions(
  topics: string[],
  collectionKeys: string[],
  allSources: PositionSource[]
): Promise<GreenPosition[]> {
  // Search all topics × collections in parallel, collect raw results
  const rawResults = await Promise.all(
    topics.map(async (topic) => {
      const positions: RawPosition[] = [];

      const searchPromises = collectionKeys.map(async (key) => {
        const mapping = COLLECTION_MAP[key];
        if (!mapping) return;

        const searchParams = getSearchParams(mapping.systemId);
        const additionalFilter = applyDefaultFilter(mapping.systemId);

        try {
          const searchResult = await documentSearchService.search({
            query: topic,
            userId: undefined,
            options: {
              searchCollection: mapping.qdrantCollection,
              limit: 6,
              mode: 'hybrid' as const,
              vectorWeight: searchParams.vectorWeight,
              textWeight: searchParams.textWeight,
              threshold: searchParams.threshold,
              recallLimit: searchParams.recallLimit,
              qualityMin: searchParams.qualityMin,
              additionalFilter,
            },
          });

          if (searchResult.success && searchResult.results) {
            for (const r of searchResult.results.slice(0, 2)) {
              const text = r.relevant_content || '';
              if (text.length > 50) {
                positions.push({
                  topic,
                  text: text.slice(0, 500),
                  title: r.title || r.filename || key,
                  collection: key,
                  url: r.source_url || null,
                  similarity: r.max_similarity || r.similarity_score || 0,
                });
              }
            }
          }
        } catch (error) {
          log.warn(`Search failed for topic "${topic}" in ${key}: ${toError(error).message}`);
        }
      });

      await Promise.all(searchPromises);
      return { topic, positions };
    })
  );

  // Assign deterministic sourceIndex sequentially after all searches complete
  let sourceIndex = 1;
  const greenPositions: GreenPosition[] = rawResults.map(({ topic, positions }) => ({
    topic,
    positions: positions.map((p) => {
      const idx = sourceIndex++;
      allSources.push({
        index: idx,
        title: p.title,
        collection: p.collection,
        collectionName: COLLECTION_LABELS[p.collection] || p.collection,
        url: p.url,
        snippet: p.text.slice(0, 300),
        similarity: p.similarity,
      });
      return { text: p.text, sourceIndex: idx };
    }),
  }));

  return greenPositions;
}

async function generateComparison(
  items: CollectedItem[],
  greenPositions: GreenPosition[],
  allSources: PositionSource[],
  customPrompt?: string
): Promise<string> {
  const articlesSection = items
    .slice(0, 10)
    .map((item) => `- ${item.title}: ${item.excerpt.slice(0, 200)}`)
    .join('\n');

  const positionsSection = greenPositions
    .map((gp) => {
      if (gp.positions.length === 0) return `### ${gp.topic}\nKeine Grünen-Position gefunden.`;
      const posTexts = gp.positions
        .map((p) => `  - [${p.sourceIndex}] ${p.text.slice(0, 400)}`)
        .join('\n');
      return `### ${gp.topic}\n${posTexts}`;
    })
    .join('\n\n');

  const defaultPrompt = `Schreibe einen analytischen Fließtext, der die Artikel-Positionen mit den Grünen Positionen vergleicht.

Stilregeln:
- Zusammenhängender Text mit kurzen Absätzen (2-3 Sätze).
- KEINE Aufzählungen, KEINE Tabellen. Nur sparsame Zwischenüberschriften bei großen Themenwechseln.
- Setze Organisationen und Namen **fett**.
- Verwende [N] Quellenverweise für Grüne Positionen.
- Tone: analytisch, sachlich, wie ein politisches Briefing.`;

  const result = await generateText({
    model: getBriefingModel(),
    system:
      'Du bist ein*e Briefing-Autor*in für ein politisches Newsletter-Format. Vergleiche Publikationen mit Grünen Positionen. Belege mit [N] Quellenverweisen. Schreibe analytischen Fließtext auf Deutsch — kurze Absätze, narrative Struktur, keine Listen.',
    prompt: `${customPrompt || defaultPrompt}

## Artikel
${articlesSection}

## Grüne Positionen aus Dokumenten (mit Quellennummern)
${positionsSection}`,
    temperature: 0.3,
    maxOutputTokens: 3000,
  });

  return result.text || 'Vergleich konnte nicht generiert werden.';
}
