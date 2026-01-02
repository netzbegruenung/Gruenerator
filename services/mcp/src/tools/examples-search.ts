/**
 * Examples Search Tool for gruenerator-mcp
 * Searches for social media examples (Instagram, Facebook) from Green Party
 */

import { z } from 'zod';
import { getQdrantClient } from '../qdrant/client.ts';
import { generateEmbedding } from '../embeddings.ts';
import { getQdrantCollectionName } from '@gruenerator/shared/search/collections';
import { buildQdrantFilter } from '@gruenerator/shared/search/filters';

const COLLECTION_NAME = getQdrantCollectionName('examples') || 'social_media_examples';
const DEFAULT_THRESHOLD = 0.15;

export const examplesSearchTool = {
  name: 'gruenerator_examples_search',
  description: `Sucht nach Social-Media-Beispielen der Grünen (Instagram, Facebook).

## Wann verwenden?

- Nutzer will Social-Media-Beispiele oder Posts sehen
- Nutzer will Kommunikationsbeispiele zu einem Thema
- Nutzer fragt "Wie kommunizieren die Grünen X auf Social Media?"
- Nutzer will Instagram- oder Facebook-Posts zu einem Thema

## Filter

- platform: "instagram", "facebook", oder "all" (Standard)
- country: "DE" (Deutschland), "AT" (Österreich), oder "all" (Standard)
- limit: 1-20 Ergebnisse (Standard: 5)

## Rückgabe

- examples[]: content, platform, country, score
- metadata: likes, comments, url, author, date

## Hinweis

Die Collection "social_media_examples" muss indexiert sein.
Bei Fehler "Collection not found" → Social-Media-Beispiele noch nicht verfügbar.

## Beispiele

- "Instagram-Posts zu Klimaschutz" → gruenerator_examples_search({ query: "Klimaschutz", platform: "instagram" })
- "Facebook-Beispiele aus Österreich" → gruenerator_examples_search({ query: "Politik", platform: "facebook", country: "AT" })
- "Wie posten Grüne über Bildung?" → gruenerator_examples_search({ query: "Bildung", limit: 10 })`,

  inputSchema: {
    query: z.string().describe('Thema für Beispielsuche (z.B. "Klimaschutz", "Bildungspolitik")'),
    platform: z.enum(['instagram', 'facebook', 'all']).default('all').describe('Plattform filtern'),
    country: z.enum(['DE', 'AT', 'all']).default('all').describe('Land filtern'),
    limit: z.number().min(1).max(20).default(5).describe('Anzahl der Ergebnisse')
  },

  async handler({ query, platform = 'all', country = 'all', limit = 5 }) {
    try {
      console.log(`[ExamplesSearch] Searching for "${query}" (platform: ${platform}, country: ${country})`);

      const qdrant = await getQdrantClient();
      const embedding = await generateEmbedding(query);

      // Build filter using shared utility
      const filterParams = {};
      if (platform !== 'all') filterParams.platform = platform;
      if (country !== 'all') filterParams.country = country;

      const filter = buildQdrantFilter(filterParams);

      // Search in Qdrant
      const searchParams = {
        vector: embedding,
        limit: limit,
        with_payload: true,
        score_threshold: DEFAULT_THRESHOLD
      };

      if (filter) {
        searchParams.filter = filter;
      }

      const results = await qdrant.search(COLLECTION_NAME, searchParams);

      console.log(`[ExamplesSearch] Found ${results?.length || 0} examples`);

      // Format results
      const examples = (results || []).map(r => ({
        id: r.id,
        content: r.payload?.content || r.payload?.caption || r.payload?.text || '',
        platform: r.payload?.platform,
        country: r.payload?.country,
        score: r.score,
        metadata: {
          likes: r.payload?.likes_count || r.payload?.likesCount,
          comments: r.payload?.comments_count || r.payload?.commentsCount,
          url: r.payload?.url || r.payload?.post_url,
          author: r.payload?.author || r.payload?.ownerUsername,
          date: r.payload?.date || r.payload?.timestamp
        }
      }));

      return {
        query,
        platform,
        country,
        resultsCount: examples.length,
        examples
      };

    } catch (error) {
      console.error('[ExamplesSearch] Error:', error.message);

      // Check if collection doesn't exist
      if (error.message?.includes('Not found') || error.message?.includes('not found')) {
        return {
          error: true,
          message: `Collection "${COLLECTION_NAME}" not found. Social media examples may not be indexed yet.`,
          query,
          platform,
          country,
          resultsCount: 0,
          examples: []
        };
      }

      return {
        error: true,
        message: error.message,
        query,
        platform,
        country,
        resultsCount: 0,
        examples: []
      };
    }
  }
};
