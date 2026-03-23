import { COLLECTIONS, getDefaultSearchCollections } from '@gruenerator/shared/search/collections';
import { z } from 'zod';

import { COLLECTION_KEYS } from '../config.ts';
import { synthesizeAnswer } from '../services/answer-synthesis.ts';
import { type Country } from '../utils/localization.ts';

import { searchTool } from './search.ts';

export const askTool = {
  name: 'gruenerator_ask',
  description: `Beantwortet Fragen zu Grünen-Parteiprogrammen und -Inhalten mit einer KI-generierten Antwort und Quellenangaben.

Im Gegensatz zu gruenerator_search (das Rohdokumente zurückgibt) generiert dieses Tool eine zusammenhängende Antwort mit [1], [2] Quellenverweisen.

## Wann verwenden?
- Wenn du eine fertige Antwort mit Quellenangaben brauchst
- Für Zusammenfassungen, Vergleiche oder Erklärungen
- Nutze gruenerator_search stattdessen, wenn du Rohdokumente zum eigenen Verarbeiten brauchst

## PFLICHTPARAMETER: country
DE = Deutschland, AT = Österreich`,

  inputSchema: {
    question: z.string().describe('Frage auf Deutsch'),
    country: z.enum(['DE', 'AT']).describe('Land: DE = Deutschland, AT = Österreich. PFLICHT.'),
    collection: z
      .enum(COLLECTION_KEYS as [string, ...string[]])
      .optional()
      .describe('Optionale Sammlung. Ohne: alle Sammlungen des Landes.'),
    mode: z
      .enum(['detailed', 'fast'])
      .default('detailed')
      .describe('detailed = mit Quellenangaben [1][2], fast = schnelle Antwort ohne Zitate'),
    limit: z.number().min(3).max(15).default(8).describe('Anzahl Quellen für die Antwort (3-15)'),
  },

  async handler({
    question,
    country,
    collection,
    mode = 'detailed',
    limit = 8,
  }: {
    question: string;
    country: Country;
    collection?: string;
    mode?: 'detailed' | 'fast';
    limit?: number;
  }) {
    if (!question || question.trim().length === 0) {
      return { error: true, message: 'Frage darf nicht leer sein' };
    }

    const startTime = Date.now();

    // Use existing search tool to get results
    const searchResult = (await searchTool.handler({
      query: question,
      country,
      collection,
      searchMode: 'hybrid',
      limit,
      filters: null,
      useCache: true,
    })) as Record<string, unknown>;

    if (searchResult.error) {
      return searchResult;
    }

    const results = searchResult.results as Array<Record<string, unknown>>;
    if (!results || results.length === 0) {
      return {
        answer: 'Zu dieser Frage konnten leider keine relevanten Quellen gefunden werden.',
        sources: [],
        metadata: {
          responseTimeMs: Date.now() - startTime,
          collectionsSearched: collection ? [collection] : getDefaultSearchCollections(country),
          sourcesCount: 0,
        },
      };
    }

    // Synthesize answer
    const synthesis = await synthesizeAnswer(
      question,
      results.map((r) => ({
        title: r.source,
        url: r.url,
        excerpt: String(r.excerpt || ''),
        score: (r.score as number) || 0,
        collection: (r.sourceCollection as string) || collection,
      })),
      mode
    );

    return {
      answer: synthesis.answer,
      sources: synthesis.sources,
      metadata: {
        responseTimeMs: Date.now() - startTime,
        collectionsSearched: collection ? [collection] : getDefaultSearchCollections(country),
        sourcesCount: synthesis.sources.length,
        model: synthesis.metadata.model,
        mode,
        searchTimeMs: synthesis.metadata.responseTimeMs,
      },
    };
  },
};
