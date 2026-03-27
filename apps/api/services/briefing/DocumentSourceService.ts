import { COLLECTION_MAP } from '../../config/collectionMap.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { scrollDocuments } from '../../database/services/QdrantService/operations/batchOperations.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { CollectedItem } from './types.js';

const log = createLogger('DocumentSource');

interface QdrantPayload {
  title?: string;
  source_url?: string;
  chunk_text?: string;
  chunk_index?: number;
  published_at?: string;
  indexed_at?: string;
  source_name?: string;
  landesverband?: string;
  content_type?: string;
  primary_category?: string;
}

export async function getRecentDocuments(
  collectionKey: string,
  since: Date,
  maxItems = 20
): Promise<CollectedItem[]> {
  const mapping = COLLECTION_MAP[collectionKey];
  if (!mapping) {
    log.warn(
      `Unknown collection: "${collectionKey}". Available: ${Object.keys(COLLECTION_MAP).join(', ')}`
    );
    return [];
  }

  try {
    const qdrant = getQdrantInstance();
    await qdrant.init();

    const cutoffISO = since.toISOString();
    const isLandesverband = mapping.qdrantCollection === 'landesverbaende_documents';

    const filter: Record<string, unknown[]> = {
      must: [
        { key: 'indexed_at', range: { gte: cutoffISO } },
        { key: 'chunk_index', match: { value: 0 } },
      ],
    };

    if (isLandesverband) {
      (filter.must as unknown[]).push({
        key: 'landesverband',
        match: { value: collectionKey },
      });
    }

    const points = await scrollDocuments(qdrant.client!, mapping.qdrantCollection, filter, {
      limit: maxItems * 2,
      withPayload: true,
      withVector: false,
    });

    const seen = new Set<string>();
    const results: CollectedItem[] = [];

    for (const point of points) {
      const p = point.payload as QdrantPayload;
      const url = p.source_url;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const sourceName = p.source_name || p.landesverband || collectionKey;

      results.push({
        url,
        title: p.title || url,
        excerpt: (p.chunk_text || '').slice(0, 500),
        source: `${sourceName}${p.content_type ? ` (${p.content_type})` : ''}`,
        sourceType: 'documents',
        publishedAt: p.published_at || p.indexed_at || null,
      });

      if (results.length >= maxItems) break;
    }

    log.info(`Documents "${collectionKey}": ${results.length} items since ${cutoffISO}`);
    return results;
  } catch (error) {
    log.error(`Document source failed for "${collectionKey}": ${toError(error).message}`);
    return [];
  }
}
