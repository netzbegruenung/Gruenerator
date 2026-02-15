import express, { Request, Response, Router } from 'express';
import { getQdrantDocumentService } from '../../services/document-services/index.js';
import {
  SYSTEM_COLLECTIONS,
  getAllSystemCollectionIds,
  getSearchParams,
  applyDefaultFilter,
} from '../../config/systemCollectionsConfig.js';
import { createLogger } from '../../utils/logger.js';

import type { DocumentResult, TopChunk } from '../../services/BaseSearchService/types.js';

const log = createLogger('ResearchController');
const router: Router = express.Router();

const SNIPPET_MAX_CHARS = 400;
const CHUNK_PREVIEW_MAX_CHARS = 200;

function truncateSnippet(text: string, limit: number = SNIPPET_MAX_CHARS): string {
  if (!text || text.length <= limit) return text;

  const truncated = text.slice(0, limit);
  const lastSentence = truncated.search(/[.!?]\s[^.!?]*$/);
  if (lastSentence > limit * 0.4) {
    return truncated.slice(0, lastSentence + 1);
  }

  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > limit * 0.6) {
    return truncated.slice(0, lastSpace) + ' …';
  }

  return truncated + ' …';
}

interface TaggedDocumentResult extends DocumentResult {
  collection_id: string;
  collection_name: string;
}

interface ResearchSearchBody {
  query: string;
  collectionIds?: string[];
  limit?: number;
}

router.post('/search', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { query, collectionIds, limit = 30 } = req.body as ResearchSearchBody;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters.' });
    return;
  }

  const trimmedQuery = query.trim();
  const effectiveLimit = Math.min(Math.max(limit, 1), 100);

  const requestedIds = collectionIds?.length
    ? collectionIds.filter((id) => id in SYSTEM_COLLECTIONS)
    : getAllSystemCollectionIds();

  if (requestedIds.length === 0) {
    res.status(400).json({ error: 'No valid collection IDs provided.' });
    return;
  }

  try {
    const documentSearchService = getQdrantDocumentService();

    const searchPromises = requestedIds.map(async (collectionId): Promise<TaggedDocumentResult[]> => {
      const config = SYSTEM_COLLECTIONS[collectionId];
      if (!config) return [];

      const searchParams = getSearchParams(collectionId);
      const additionalFilter = applyDefaultFilter(collectionId, undefined);

      try {
        const resp = await documentSearchService.search({
          query: trimmedQuery,
          userId: undefined,
          options: {
            limit: searchParams.limit,
            mode: searchParams.mode,
            vectorWeight: searchParams.vectorWeight,
            textWeight: searchParams.textWeight,
            threshold: searchParams.threshold,
            searchCollection: config.qdrantCollection,
            recallLimit: searchParams.recallLimit,
            qualityMin: searchParams.qualityMin,
            additionalFilter,
          },
        });

        return (resp.results || []).map((doc) => ({
          ...doc,
          collection_id: collectionId,
          collection_name: config.name,
        }));
      } catch (error: any) {
        log.error(`Search error for ${collectionId}: ${error.message}`);
        return [];
      }
    });

    const allResults = (await Promise.all(searchPromises)).flat();

    // Deduplicate by source_url (or document_id), keeping highest similarity_score
    const dedupMap = new Map<string, TaggedDocumentResult>();
    for (const result of allResults) {
      const key = result.source_url || result.document_id;
      const existing = dedupMap.get(key);
      if (!existing || result.similarity_score > existing.similarity_score) {
        dedupMap.set(key, result);
      }
    }

    const deduped = Array.from(dedupMap.values())
      .filter((r) => r.similarity_score >= 0.35)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, effectiveLimit);

    // Truncate text fields for the response
    const truncated = deduped.map((r) => ({
      ...r,
      relevant_content: truncateSnippet(r.relevant_content),
      top_chunks: r.top_chunks.map((chunk: TopChunk) => ({
        preview: truncateSnippet(chunk.preview, CHUNK_PREVIEW_MAX_CHARS),
        chunk_index: chunk.chunk_index,
        page_number: chunk.page_number ?? null,
      })),
    }));

    const collectionsFound = [...new Set(deduped.map((r) => r.collection_id))];

    res.json({
      results: truncated,
      metadata: {
        totalResults: deduped.length,
        collections: collectionsFound,
        timeMs: Date.now() - startTime,
      },
    });
  } catch (error: any) {
    log.error(`Research search failed: ${error.message}`);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

export default router;
