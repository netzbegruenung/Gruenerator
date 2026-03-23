import {
  COLLECTIONS,
  getDefaultSearchCollections,
  buildCollectionDefaultFilter,
} from '@gruenerator/shared/search/collections';
import { buildQdrantFilter, mergeFilters } from '@gruenerator/shared/search/filters';
import { z } from 'zod';

import { config, COLLECTION_KEYS } from '../config.ts';
import { generateEmbedding } from '../embeddings.ts';
import {
  searchCollection,
  hybridSearchCollection,
  textSearchCollection,
} from '../qdrant/client.ts';
import {
  getCachedEmbedding,
  cacheEmbedding,
  getCachedSearch,
  cacheSearch,
  getCacheStats,
} from '../utils/cache.ts';
import { type Country } from '../utils/localization.ts';

type SearchMode = 'hybrid' | 'vector' | 'text';

interface SearchResult {
  score: number;
  title: string;
  url: string | null;
  text: string;
  searchMethod?: string;
  documentId?: string;
  qualityScore?: number;
  payload?: Record<string, unknown>;
}

function truncateAtSentence(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('.\n')
  );
  if (lastSentenceEnd > maxLength * 0.5) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '…';
}

function extractPayloadMetadata(result: SearchResult): {
  category: string | null;
  contentType: string | null;
  date: string | null;
} {
  const payload = result.payload;
  const metadata = payload?.metadata as Record<string, unknown> | undefined;
  return {
    category: (payload?.primary_category ?? metadata?.primary_category ?? null) as string | null,
    contentType: (payload?.content_type ?? metadata?.content_type ?? null) as string | null,
    date: (payload?.date ?? payload?.published_date ?? metadata?.date ?? null) as string | null,
  };
}

function formatResult(
  r: SearchResult,
  index: number,
  searchMode: SearchMode,
  sourceCollection?: string
) {
  const { category, contentType, date } = extractPayloadMetadata(r);
  const base: Record<string, unknown> = {
    rank: index + 1,
    relevance: `${Math.round(r.score * 100)}%`,
    score: Math.round(r.score * 1000) / 1000,
    source: r.title,
    url: r.url,
    excerpt: truncateAtSentence(r.text || '', 800),
    searchMethod: r.searchMethod || searchMode,
  };
  if (r.documentId) base.documentId = r.documentId;
  if (category) base.category = category;
  if (contentType) base.contentType = contentType;
  if (date) base.date = date;
  if (sourceCollection) base.sourceCollection = sourceCollection;
  return base;
}

function buildDocumentGroups(results: Array<Record<string, unknown>>): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const r of results) {
    const title = String(r.source || 'Unbekannt');
    groups[title] = (groups[title] || 0) + 1;
  }
  return groups;
}

async function searchSingleCollection({
  collectionKey,
  query,
  searchMode,
  limit,
  filters,
  useCache,
  sharedEmbedding,
}: {
  collectionKey: string;
  query: string;
  searchMode: SearchMode;
  limit: number;
  filters: Record<string, string> | null;
  useCache: boolean;
  sharedEmbedding: number[] | null;
}): Promise<{ results: SearchResult[]; collectionKey: string; metadata: Record<string, unknown> }> {
  const collectionConfig = config.collections[collectionKey];
  if (!collectionConfig) return { results: [], collectionKey, metadata: {} };

  const userFilter = buildQdrantFilter(filters);
  const defaultFilter = buildCollectionDefaultFilter(collectionKey);
  const qdrantFilter = mergeFilters(defaultFilter, userFilter) as Record<string, unknown> | null;
  let results: SearchResult[];
  let metadata: Record<string, unknown> = {};

  if (searchMode === 'text') {
    results = await textSearchCollection(collectionConfig.name, query, limit, qdrantFilter);
    metadata.searchType = 'text';
  } else {
    if (!sharedEmbedding) {
      throw new Error(`Embedding required for searchMode "${searchMode}" but not provided`);
    }
    if (searchMode === 'hybrid') {
      const hybridResult = await hybridSearchCollection(
        collectionConfig.name,
        sharedEmbedding,
        query,
        limit,
        { filter: qdrantFilter }
      );
      results = hybridResult.results;
      metadata = { searchType: 'hybrid', ...hybridResult.metadata };
    } else {
      results = await searchCollection(collectionConfig.name, sharedEmbedding, limit, qdrantFilter);
      metadata.searchType = 'vector';
    }
  }

  return { results: results || [], collectionKey, metadata };
}

function buildSearchDescription(): string {
  const deCollections = getDefaultSearchCollections('DE').join(', ');
  const atCollections = getDefaultSearchCollections('AT').join(', ');

  const defaultRows = Object.entries(COLLECTIONS)
    .filter(([, col]) => !col.defaultFilter)
    .map(([key, col]) => `| ${key} | ${col.displayName} | ${col.description} |`)
    .join('\n');

  const lvRows = Object.entries(COLLECTIONS)
    .filter(([, col]) => col.defaultFilter && col.includeInDefaultSearch === false)
    .map(([key, col]) => `| ${key} | ${col.displayName} | ${col.description} |`)
    .join('\n');

  return `Durchsucht Grüne Parteiprogramme und Inhalte mit semantischer und textbasierter Suche.

## PFLICHTPARAMETER: country

Jede Suche benötigt ein Land (DE oder AT). Das Land bestimmt, welche Sammlungen durchsucht werden.

- **DE** (Deutschland): ${deCollections}
- **AT** (Österreich): ${atCollections}

## SAMMLUNGSAUSWAHL

Ohne \`collection\`-Parameter werden automatisch ALLE Sammlungen des Landes durchsucht (empfohlen).
Mit \`collection\`-Parameter wird nur diese eine Sammlung durchsucht.

## Sammlungen

| ID | Name | Inhalt |
|----|------|--------|
${defaultRows}

## Landesverbände (nur mit explizitem \`collection\`-Parameter)

Diese Sammlungen werden NICHT bei der Landessuche mitdurchsucht. Sie müssen explizit angegeben werden.

| ID | Name | Inhalt |
|----|------|--------|
${lvRows}

## Filter

WICHTIG: Rufe ZUERST gruenerator_get_filters auf, um gültige Filterwerte zu erfahren!

| Sammlung | Verfügbare Filter |
|----------|-------------------|
| alle Sammlungen | primary_category (Hauptkategorie) |
| kommunalwiki, boell-stiftung | content_type (Inhaltstyp), subcategories (Unterkategorien) |
| boell-stiftung | region (z.B. europa, asien, nahost) |
| bundestagsfraktion, gruene-de, gruene-at | country (DE oder AT) |
| examples | platform (instagram, facebook), country (DE oder AT) |
| Landesverbände | content_type (Typ), primary_category (Kategorie) |

## Beispiele

Suche in allen deutschen Sammlungen:
{ "query": "Klimaschutz", "country": "DE" }

Suche in einer bestimmten Sammlung:
{ "query": "Klimaschutz", "country": "DE", "collection": "kommunalwiki" }

Suche in einem Landesverband:
{ "query": "Klimaschutz", "country": "DE", "collection": "hamburg" }

Suche mit Filter (NACH Aufruf von gruenerator_get_filters):
{ "query": "Klimaschutz", "country": "DE", "collection": "kommunalwiki", "filters": { "content_type": "praxishilfe" } }`;
}

export const searchTool = {
  name: 'gruenerator_search',
  description: buildSearchDescription(),

  inputSchema: {
    query: z.string().describe('Suchbegriff oder Frage auf Deutsch'),
    country: z.enum(['DE', 'AT']).describe('Land: DE = Deutschland, AT = Österreich. PFLICHT.'),
    collection: z
      .enum(COLLECTION_KEYS as [string, ...string[]])
      .optional()
      .describe(
        'Optionale Sammlung. Wenn nicht gesetzt, werden alle Sammlungen des Landes durchsucht.'
      ),
    searchMode: z
      .enum(['hybrid', 'vector', 'text'])
      .default('hybrid')
      .describe('hybrid=beste Ergebnisse, vector=semantisch, text=exakte Begriffe'),
    limit: z.number().min(1).max(20).default(5).describe('Anzahl Ergebnisse (1-20)'),
    filters: z
      .object({
        primary_category: z
          .string()
          .optional()
          .describe('Hauptkategorie (alle Sammlungen) - erst gruenerator_get_filters aufrufen!'),
        content_type: z
          .string()
          .optional()
          .describe(
            'Inhaltstyp (für kommunalwiki, boell-stiftung) - erst gruenerator_get_filters aufrufen!'
          ),
        subcategories: z
          .string()
          .optional()
          .describe(
            'Unterkategorie (für kommunalwiki, boell-stiftung) - erst gruenerator_get_filters aufrufen!'
          ),
        region: z
          .string()
          .optional()
          .describe(
            'Region (nur boell-stiftung: europa, asien, nahost, etc.) - erst gruenerator_get_filters aufrufen!'
          ),
        country: z
          .string()
          .optional()
          .describe(
            'Land (DE oder AT für bundestagsfraktion, gruene-de, gruene-at, examples) - erst gruenerator_get_filters aufrufen!'
          ),
        platform: z
          .string()
          .optional()
          .describe(
            'Plattform (instagram oder facebook, nur für examples) - erst gruenerator_get_filters aufrufen!'
          ),
      })
      .optional()
      .describe(
        'Filter - IMMER erst gruenerator_get_filters aufrufen um gültige Werte zu erhalten'
      ),
    useCache: z.boolean().default(true).describe('Cache für schnellere Ergebnisse'),
  },

  async handler({
    query,
    country,
    collection,
    searchMode = 'hybrid',
    limit = 5,
    filters = null,
    useCache = true,
  }: {
    query: string;
    country: Country;
    collection?: string;
    searchMode?: SearchMode;
    limit?: number;
    filters?: Record<string, string> | null;
    useCache?: boolean;
  }) {
    if (!query || query.trim().length === 0) {
      return {
        error: true,
        message: 'Suchbegriff darf nicht leer sein',
      };
    }

    const safeLimit = Math.min(Math.max(1, limit), 20);

    // Path A: Explicit collection — search only that one
    if (collection) {
      const collectionConfig = config.collections[collection];
      if (!collectionConfig) {
        const available = Object.keys(config.collections).join(', ');
        return {
          error: true,
          message: `Unbekannte Sammlung: ${collection}. Verfügbar: ${available}`,
        };
      }
      return searchSingleCollectionWithCache({
        query,
        country,
        collectionKey: collection,
        searchMode,
        limit: safeLimit,
        filters,
        useCache,
      });
    }

    // Path B: No collection — search all collections for the country
    return searchMultipleCollections({
      query,
      country,
      searchMode,
      limit: safeLimit,
      filters,
      useCache,
    });
  },
};

async function searchSingleCollectionWithCache({
  query,
  country,
  collectionKey,
  searchMode,
  limit,
  filters,
  useCache,
}: {
  query: string;
  country: Country;
  collectionKey: string;
  searchMode: SearchMode;
  limit: number;
  filters: Record<string, string> | null;
  useCache: boolean;
}) {
  const collectionConfig = config.collections[collectionKey]!;

  try {
    if (useCache) {
      const cachedResults = getCachedSearch(collectionKey, query, searchMode, filters);
      if (cachedResults && typeof cachedResults === 'object') {
        console.error(`[Search] Cache hit for "${query.substring(0, 30)}..."`);
        return { ...(cachedResults as Record<string, unknown>), cached: true };
      }
    }

    console.error(
      `[Search] Mode: ${searchMode}, Query: "${query.substring(0, 50)}...", Country: ${country}`
    );
    if (filters) {
      console.error(`[Search] Filters: ${JSON.stringify(filters)}`);
    }

    // Get or generate embedding
    let embedding: number[] | null = null;
    if (searchMode !== 'text') {
      embedding = useCache ? getCachedEmbedding(query) : null;
      if (!embedding) {
        console.error(`[Search] Generating embedding`);
        embedding = await generateEmbedding(query);
        if (useCache) cacheEmbedding(query, embedding);
      } else {
        console.error(`[Search] Using cached embedding`);
      }
    }

    const { results, metadata } = await searchSingleCollection({
      collectionKey,
      query,
      searchMode,
      limit,
      filters,
      useCache,
      sharedEmbedding: embedding,
    });

    if (!results || results.length === 0) {
      return {
        collection: collectionConfig.displayName,
        country,
        query,
        searchMode,
        message: 'Keine Ergebnisse gefunden',
        results: [],
        metadata,
        filters: filters || null,
      };
    }

    const formattedResults = results.map((r, i) => formatResult(r, i, searchMode));
    const response = {
      collection: collectionConfig.displayName,
      description: collectionConfig.description,
      country,
      query,
      searchMode,
      resultsCount: results.length,
      results: formattedResults,
      documentGroups: buildDocumentGroups(formattedResults),
      metadata,
      filters: filters || null,
      cached: false,
    };

    if (useCache) {
      cacheSearch(collectionKey, query, searchMode, response, filters);
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Search] Fehler:', message);
    return {
      error: true,
      message: `Suchfehler: ${message}`,
    };
  }
}

async function searchMultipleCollections({
  query,
  country,
  searchMode,
  limit,
  filters,
  useCache,
}: {
  query: string;
  country: Country;
  searchMode: SearchMode;
  limit: number;
  filters: Record<string, string> | null;
  useCache: boolean;
}) {
  const collections = getDefaultSearchCollections(country);
  if (!collections || collections.length === 0) {
    return {
      error: true,
      message: `Unbekanntes Land: ${country}. Verfügbar: DE, AT`,
    };
  }

  // Check cache under composite key
  const cacheKey = `country:${country}`;
  if (useCache) {
    const cachedResults = getCachedSearch(cacheKey, query, searchMode, filters);
    if (cachedResults && typeof cachedResults === 'object') {
      console.error(`[Search] Cache hit for country search "${query.substring(0, 30)}..."`);
      return { ...(cachedResults as Record<string, unknown>), cached: true };
    }
  }

  console.error(
    `[Search] Multi-collection search: ${collections.join(', ')}, Country: ${country}, Query: "${query.substring(0, 50)}..."`
  );

  try {
    // Generate embedding ONCE (shared across all collections)
    let embedding: number[] | null = null;
    if (searchMode !== 'text') {
      embedding = useCache ? getCachedEmbedding(query) : null;
      if (!embedding) {
        console.error(`[Search] Generating shared embedding`);
        embedding = await generateEmbedding(query);
        if (useCache) cacheEmbedding(query, embedding);
      } else {
        console.error(`[Search] Using cached embedding`);
      }
    }

    // Over-fetch per collection, then deduplicate and trim
    const perCollectionLimit = Math.ceil(limit * 1.5);

    const collectionResults = await Promise.all(
      collections.map((collectionKey) =>
        searchSingleCollection({
          collectionKey,
          query,
          searchMode,
          limit: perCollectionLimit,
          filters,
          useCache,
          sharedEmbedding: embedding,
        }).catch((err) => {
          console.error(`[Search] Collection ${collectionKey} failed: ${err.message}`);
          return { results: [] as SearchResult[], collectionKey, metadata: {} };
        })
      )
    );

    // Merge, deduplicate by URL, sort by score
    const seenUrls = new Set<string>();
    const allResults: (SearchResult & { sourceCollection: string })[] = [];

    for (const { results, collectionKey } of collectionResults) {
      for (const r of results) {
        const url = typeof r.url === 'string' ? r.url.trim() : undefined;
        if (url && seenUrls.has(url)) continue;
        if (url) seenUrls.add(url);
        allResults.push({ ...r, sourceCollection: collectionKey });
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    const topResults = allResults.slice(0, limit);

    const collectionsSearched = collections
      .map((key) => config.collections[key]?.displayName || key)
      .join(', ');

    if (topResults.length === 0) {
      return {
        country,
        collectionsSearched,
        query,
        searchMode,
        message: 'Keine Ergebnisse gefunden',
        results: [],
        metadata: { searchType: searchMode, multiCollection: true },
        filters: filters || null,
      };
    }

    const formattedResults = topResults.map((r, i) =>
      formatResult(r, i, searchMode, r.sourceCollection)
    );
    const response = {
      country,
      collectionsSearched,
      query,
      searchMode,
      resultsCount: topResults.length,
      results: formattedResults,
      documentGroups: buildDocumentGroups(formattedResults),
      metadata: {
        searchType: searchMode,
        multiCollection: true,
        collectionsQueried: collections.length,
      },
      filters: filters || null,
      cached: false,
    };

    if (useCache) {
      cacheSearch(cacheKey, query, searchMode, response, filters);
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Search] Multi-collection search error:', message);
    return {
      error: true,
      message: `Suchfehler: ${message}`,
    };
  }
}

/**
 * Get cache statistics tool
 */
export const cacheStatsTool = {
  name: 'gruenerator_cache_stats',
  description: 'Zeigt Cache-Statistiken für die Suche an',

  inputSchema: {},

  async handler() {
    const stats = getCacheStats();
    return {
      message: 'Cache-Statistiken',
      ...stats,
    };
  },
};
