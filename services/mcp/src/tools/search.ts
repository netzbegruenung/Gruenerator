import { buildQdrantFilter } from '@gruenerator/shared/search/filters';
import { z } from 'zod';

import { config, COLLECTION_KEYS } from '../config.ts';
import { generateEmbedding } from '../embeddings.ts';
import { searchCollection, hybridSearchCollection, textSearchCollection } from '../qdrant/client.ts';
import { getEnrichedPersonSearch } from '../services/enriched-person-search.ts';
import {
  getCachedEmbedding,
  cacheEmbedding,
  getCachedSearch,
  cacheSearch,
  getCacheStats
} from '../utils/cache.ts';

export const searchTool = {
  name: 'gruenerator_search',
  description: `Durchsucht Grüne Parteiprogramme und Inhalte mit semantischer und textbasierter Suche.

## REGELN FÜR DIE SAMMLUNGSAUSWAHL

1. Wenn der Nutzer eine BESTIMMTE Sammlung nennt (z.B. "kommunalwiki", "deutschland") → verwende GENAU diese
2. Wenn der Nutzer MEHRERE Sammlungen will → rufe dieses Tool MEHRFACH auf (einmal pro Sammlung)
3. Wenn UNKLAR → frage nach oder nutze die passendste Sammlung

## Sammlungen

| ID | Name | Inhalt |
|----|------|--------|
| oesterreich | Die Grünen Österreich | EU-Wahl, Grundsatz, Nationalrat Programme |
| deutschland | Bündnis 90/Die Grünen | Grundsatzprogramm 2020, EU-Wahl 2024, Regierung 2025 |
| bundestagsfraktion | Grüne Bundestagsfraktion | Positionen, Fachtexte von gruene-bundestag.de |
| gruene-de | Grüne Deutschland | Inhalte von gruene.de |
| gruene-at | Grüne Österreich | Inhalte von gruene.at |
| kommunalwiki | KommunalWiki | Kommunalpolitik-Fachwissen (Böll-Stiftung) |
| boell-stiftung | Heinrich-Böll-Stiftung | Analysen, Dossiers, Atlanten |
| examples | Social Media Beispiele | Instagram/Facebook Posts als Inspiration |

## Filter

WICHTIG: Rufe ZUERST gruenerator_get_filters auf, um gültige Filterwerte zu erfahren!

| Sammlung | Verfügbare Filter |
|----------|-------------------|
| alle Sammlungen | primary_category (Hauptkategorie) |
| kommunalwiki, boell-stiftung | content_type (Inhaltstyp), subcategories (Unterkategorien) |
| boell-stiftung | region (z.B. europa, asien, nahost) |
| bundestagsfraktion, gruene-de, gruene-at | country (DE oder AT) |
| examples | platform (instagram, facebook), country (DE oder AT) |

## Beispiele

Suche in kommunalwiki nach AfD:
{ "query": "AfD Umgang", "collection": "kommunalwiki" }

Suche mit Filter (NACH Aufruf von gruenerator_get_filters):
{ "query": "Klimaschutz", "collection": "kommunalwiki", "filters": { "content_type": "praxishilfe" } }`,

  inputSchema: {
    query: z.string().describe('Suchbegriff oder Frage auf Deutsch'),
    collection: z.enum(COLLECTION_KEYS).describe('Exakte Sammlung wie vom Nutzer genannt. Bei mehreren Sammlungen: Tool mehrfach aufrufen.'),
    searchMode: z.enum(['hybrid', 'vector', 'text']).default('hybrid').describe('hybrid=beste Ergebnisse, vector=semantisch, text=exakte Begriffe'),
    limit: z.number().min(1).max(20).default(5).describe('Anzahl Ergebnisse (1-20)'),
    filters: z.object({
      primary_category: z.string().optional().describe('Hauptkategorie (alle Sammlungen) - erst gruenerator_get_filters aufrufen!'),
      content_type: z.string().optional().describe('Inhaltstyp (für kommunalwiki, boell-stiftung) - erst gruenerator_get_filters aufrufen!'),
      subcategories: z.string().optional().describe('Unterkategorie (für kommunalwiki, boell-stiftung) - erst gruenerator_get_filters aufrufen!'),
      region: z.string().optional().describe('Region (nur boell-stiftung: europa, asien, nahost, etc.) - erst gruenerator_get_filters aufrufen!'),
      country: z.string().optional().describe('Land (DE oder AT für bundestagsfraktion, gruene-de, gruene-at, examples) - erst gruenerator_get_filters aufrufen!'),
      platform: z.string().optional().describe('Plattform (instagram oder facebook, nur für examples) - erst gruenerator_get_filters aufrufen!')
    }).optional().describe('Filter - IMMER erst gruenerator_get_filters aufrufen um gültige Werte zu erhalten'),
    useCache: z.boolean().default(true).describe('Cache für schnellere Ergebnisse')
  },

  async handler({ query, collection, searchMode = 'hybrid', limit = 5, filters = null, useCache = true }) {
    const collectionConfig = config.collections[collection];
    if (!collectionConfig) {
      const available = Object.keys(config.collections).join(', ');
      return {
        error: true,
        message: `Unbekannte Sammlung: ${collection}. Verfügbar: ${available}`
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        error: true,
        message: 'Suchbegriff darf nicht leer sein'
      };
    }

    const safeLimit = Math.min(Math.max(1, limit), 20);

    try {
      // Try enriched person search for bundestagsfraktion collection
      if (collection === 'bundestagsfraktion') {
        try {
          const enrichedService = getEnrichedPersonSearch();
          const personResult = await enrichedService.search(query);

          if (personResult.isPersonQuery) {
            console.error(`[Search] Enriched person search for: ${personResult.metadata.extractedName}`);
            return formatPersonSearchResult(personResult, collectionConfig);
          }
        } catch (personError) {
          console.error('[Search] Person detection failed, falling back to regular search:', personError.message);
        }
      }

      // Check search cache first
      if (useCache) {
        const cachedResults = getCachedSearch(collection, query, searchMode, filters);
        if (cachedResults) {
          console.error(`[Search] Cache hit for "${query.substring(0, 30)}..."`);
          return {
            ...cachedResults,
            cached: true
          };
        }
      }

      let results;
      let metadata: Record<string, unknown> = {};

      console.error(`[Search] Mode: ${searchMode}, Query: "${query.substring(0, 50)}..."`);
      if (filters) {
        console.error(`[Search] Filters: ${JSON.stringify(filters)}`);
      }

      // Build Qdrant filter from metadata filters
      const qdrantFilter = buildQdrantFilter(filters) as Record<string, unknown> | null;

      if (searchMode === 'text') {
        console.error(`[Search] Performing text-only search in ${collectionConfig.name}`);
        results = await textSearchCollection(collectionConfig.name, query, safeLimit, qdrantFilter);
        metadata.searchType = 'text';
      } else if (searchMode === 'hybrid') {
        // Check embedding cache
        let embedding = useCache ? getCachedEmbedding(query) : null;

        if (!embedding) {
          console.error(`[Search] Generating embedding for hybrid search`);
          embedding = await generateEmbedding(query);
          if (useCache) {
            cacheEmbedding(query, embedding);
          }
        } else {
          console.error(`[Search] Using cached embedding`);
        }

        console.error(`[Search] Performing hybrid search in ${collectionConfig.name}`);
        const hybridResult = await hybridSearchCollection(
          collectionConfig.name,
          embedding,
          query,
          safeLimit,
          { filter: qdrantFilter }
        );
        results = hybridResult.results;
        metadata = {
          searchType: 'hybrid',
          ...hybridResult.metadata
        };
      } else {
        // Vector search
        let embedding = useCache ? getCachedEmbedding(query) : null;

        if (!embedding) {
          console.error(`[Search] Generating embedding for vector search`);
          embedding = await generateEmbedding(query);
          if (useCache) {
            cacheEmbedding(query, embedding);
          }
        } else {
          console.error(`[Search] Using cached embedding`);
        }

        console.error(`[Search] Performing vector search in ${collectionConfig.name}`);
        results = await searchCollection(collectionConfig.name, embedding, safeLimit, qdrantFilter);
        metadata.searchType = 'vector';
      }

      if (!results || results.length === 0) {
        const response = {
          collection: collectionConfig.displayName,
          query: query,
          searchMode: searchMode,
          message: 'Keine Ergebnisse gefunden',
          results: [],
          metadata,
          filters: filters || null
        };
        return response;
      }

      const response = {
        collection: collectionConfig.displayName,
        description: collectionConfig.description,
        query: query,
        searchMode: searchMode,
        resultsCount: results.length,
        results: results.map((r, i) => ({
          rank: i + 1,
          relevance: `${Math.round(r.score * 100)}%`,
          source: r.title,
          url: r.url || null,
          excerpt: r.text.length > 800 ? r.text.substring(0, 800) + '...' : r.text,
          searchMethod: r.searchMethod || searchMode
        })),
        metadata,
        filters: filters || null,
        cached: false
      };

      // Cache the results
      if (useCache) {
        cacheSearch(collection, query, searchMode, response, filters);
      }

      return response;

    } catch (error) {
      console.error('[Search] Fehler:', error.message);
      return {
        error: true,
        message: `Suchfehler: ${error.message}`
      };
    }
  }
};

/**
 * Format enriched person search result for MCP response
 */
function formatPersonSearchResult(personResult, collectionConfig) {
  const { person, contentMentions, drucksachen, aktivitaeten, metadata } = personResult;

  const results = [];

  // Add person profile as first result
  results.push({
    rank: 1,
    relevance: '100%',
    source: `Profil: ${person.name}`,
    type: 'person_profile',
    excerpt: [
      person.fraktion ? `Fraktion: ${person.fraktion}` : null,
      person.wahlkreis ? `Wahlkreis: ${person.wahlkreis}` : null,
      person.beruf ? `Beruf: ${person.beruf}` : null,
      person.vita ? `\n${person.vita}` : null
    ].filter(Boolean).join('\n'),
    searchMethod: 'person_detection'
  });

  // Add content mentions
  for (const mention of (contentMentions || []).slice(0, 5)) {
    results.push({
      rank: results.length + 1,
      relevance: `${Math.round(mention.similarity * 100)}%`,
      source: mention.title,
      url: mention.url,
      type: 'content_mention',
      excerpt: mention.snippet,
      searchMethod: mention.searchMethod || 'hybrid'
    });
  }

  // Add Drucksachen
  for (const d of (drucksachen || []).slice(0, 5)) {
    results.push({
      rank: results.length + 1,
      relevance: '95%',
      source: `${d.drucksachetyp}: ${d.titel}`,
      url: `https://dip.bundestag.de/drucksache/${d.dokumentnummer}`,
      type: 'drucksache',
      excerpt: `${d.dokumentnummer} vom ${d.datum}`,
      searchMethod: 'dip_api'
    });
  }

  // Add Aktivitäten
  for (const a of (aktivitaeten || []).slice(0, 5)) {
    results.push({
      rank: results.length + 1,
      relevance: '90%',
      source: `${a.aktivitaetsart}: ${a.titel || 'Aktivität'}`,
      type: 'aktivitaet',
      excerpt: `${a.aktivitaetsart} vom ${a.datum}`,
      searchMethod: 'dip_api'
    });
  }

  return {
    collection: collectionConfig.displayName,
    description: collectionConfig.description,
    query: metadata.query,
    searchMode: 'person_enriched',
    isPersonQuery: true,
    person: {
      name: person.name,
      fraktion: person.fraktion,
      wahlkreis: person.wahlkreis
    },
    resultsCount: results.length,
    results,
    metadata: {
      searchType: 'person_enriched',
      detectionConfidence: metadata.detectionConfidence,
      detectionSource: metadata.detectionSource,
      contentMentionsCount: metadata.contentMentionsCount,
      drucksachenCount: metadata.drucksachenCount,
      aktivitaetenCount: metadata.aktivitaetenCount,
      fetchTimeMs: metadata.fetchTimeMs
    },
    cached: false
  };
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
      ...stats
    };
  }
};
