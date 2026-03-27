import { COLLECTIONS } from '@gruenerator/shared/search/collections';
import { z } from 'zod';

import { COLLECTION_KEYS } from '../config.ts';
import { generateEmbedding } from '../embeddings.ts';
import { getCachedEmbedding, cacheEmbedding } from '../utils/cache.ts';
import { type Country } from '../utils/localization.ts';

import { searchTool } from './search.ts';

export const compareTool = {
  name: 'gruenerator_compare',
  description: `Vergleicht Suchergebnisse aus verschiedenen Quellen nebeneinander.

Ideal für:
- DE vs AT Vergleiche (z.B. "Klimaschutz in Deutschland vs Österreich")
- Vergleich zwischen Sammlungen (z.B. Grundsatzprogramm vs Bundestagsfraktion)
- Bis zu 3 Quellen gleichzeitig

Jede Quelle wird separat durchsucht und die Ergebnisse nebeneinander zurückgegeben.`,

  inputSchema: {
    query: z.string().describe('Suchbegriff oder Frage auf Deutsch'),
    sources: z
      .array(
        z.object({
          country: z.enum(['DE', 'AT']).describe('Land'),
          collection: z
            .enum(COLLECTION_KEYS as [string, ...string[]])
            .optional()
            .describe('Optionale Sammlung'),
          label: z.string().optional().describe('Optionales Label für diese Quelle'),
        })
      )
      .min(2)
      .max(3)
      .describe('2-3 Quellen zum Vergleichen'),
    limit: z.number().min(1).max(10).default(5).describe('Ergebnisse pro Quelle (1-10)'),
  },

  async handler({
    query,
    sources,
    limit = 5,
  }: {
    query: string;
    sources: Array<{ country: Country; collection?: string; label?: string }>;
    limit?: number;
  }) {
    if (!query || query.trim().length === 0) {
      return { error: true, message: 'Suchbegriff darf nicht leer sein' };
    }

    const startTime = Date.now();

    // Pre-warm embedding cache so parallel searches don't race
    const cached = getCachedEmbedding(query);
    if (!cached) {
      const embedding = await generateEmbedding(query);
      cacheEmbedding(query, embedding);
    }

    const sourceResults = await Promise.all(
      sources.map(async (source) => {
        const label =
          source.label ||
          (source.collection
            ? COLLECTIONS[source.collection]?.displayName || source.collection
            : source.country === 'DE'
              ? 'Deutschland'
              : 'Österreich');

        try {
          const result = (await searchTool.handler({
            query,
            country: source.country,
            collection: source.collection,
            searchMode: 'hybrid',
            limit,
            filters: null,
            useCache: true,
          })) as Record<string, unknown>;

          return {
            label,
            country: source.country,
            collection: source.collection || null,
            resultsCount: (result.resultsCount as number) || 0,
            results: result.results || [],
            error: result.error ? (result.message as string) : null,
          };
        } catch (err) {
          return {
            label,
            country: source.country,
            collection: source.collection || null,
            resultsCount: 0,
            results: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    return {
      query,
      comparison: sourceResults,
      metadata: {
        responseTimeMs: Date.now() - startTime,
        sourcesCompared: sources.length,
      },
    };
  },
};
