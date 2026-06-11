/**
 * Recent documents for system notebook collections.
 *
 * Returns the most recently published documents for a system collection
 * (or a merged union for multi-source notebooks). Powers the
 * "Zuletzt hinzugefügt" section on notebook startpages.
 */

import {
  getSystemCollectionConfig,
  applyDefaultFilter,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';

import type { ScrollPoint } from '../../database/services/QdrantService/operations/types.js';
import type { NotebookRecentDocumentCard } from '@gruenerator/contracts';

const log = createLogger('notebookRecent');

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
// Qdrant stores N chunks per article (chunk_index 0..N-1). We filter chunk_index=0
// so SCROLL_WINDOW counts articles, not chunks. 2500 covers every system LV
// collection in full (largest is hamburg-lv-presse ≈ 1948 articles).
const SCROLL_WINDOW = 2500;

export function normalizeRecentLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

function pickString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function toCard(
  payload: Record<string, unknown>,
  collectionId: string,
  collectionName: string,
  pointId: string | number
): NotebookRecentDocumentCard {
  const title =
    pickString(payload, 'title', 'name', 'headline') ??
    pickString(payload, 'primary_category') ??
    'Ohne Titel';
  const snippet = pickString(payload, 'summary', 'description', 'excerpt', 'text');
  const url = pickString(payload, 'url', 'source_url', 'external_url');
  const publishedAt = pickString(payload, 'published_at', 'publishedAt', 'date');
  const sourceLabel = pickString(
    payload,
    'source_label',
    'source_id',
    'content_type',
    'primary_category'
  );

  return {
    id: String(pointId),
    collectionId,
    collectionName,
    title,
    snippet: snippet ? (snippet.length > 220 ? `${snippet.slice(0, 217)}…` : snippet) : null,
    url,
    publishedAt,
    sourceLabel,
  };
}

export async function fetchRecentForCollection(
  collectionId: string,
  limit: number
): Promise<NotebookRecentDocumentCard[]> {
  const config = getSystemCollectionConfig(collectionId);
  if (!config) {
    log.debug(`Unknown system collection: ${collectionId}`);
    return [];
  }

  const qdrant = getQdrantInstance();
  await qdrant.init();

  if (!qdrant.operations) {
    log.warn('Qdrant operations unavailable');
    return [];
  }

  // Constrain to chunk_index=0 so each article contributes exactly one point.
  // Without this, we sample chunks (random per Qdrant point-id ordering) and
  // small collections like the 7-article Wahlprogramm dominate every result.
  const baseFilter = applyDefaultFilter(collectionId, undefined) ?? {};
  const filter = {
    ...baseFilter,
    must: [...(baseFilter.must ?? []), { key: 'chunk_index', match: { value: 0 } }],
  };

  try {
    const points = await qdrant.operations.scrollDocuments(config.qdrantCollection, filter, {
      limit: SCROLL_WINDOW,
      withPayload: true,
    });

    const cards = points.map((p: ScrollPoint) =>
      toCard(
        p.payload as Record<string, unknown>,
        collectionId,
        config.name,
        p.id as string | number
      )
    );

    const sorted = cards.sort(byPublishedAtDesc);

    return dedupeByUrlOrTitle(sorted).slice(0, limit);
  } catch (error) {
    log.warn(
      `Recent scroll failed for ${collectionId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

export function byPublishedAtDesc(
  a: NotebookRecentDocumentCard,
  b: NotebookRecentDocumentCard
): number {
  if (!a.publishedAt && !b.publishedAt) return 0;
  if (!a.publishedAt) return 1;
  if (!b.publishedAt) return -1;
  return b.publishedAt.localeCompare(a.publishedAt);
}

export function dedupeByUrlOrTitle(
  cards: NotebookRecentDocumentCard[]
): NotebookRecentDocumentCard[] {
  // Dedup by URL AND by title. The title key catches duplicates that the URL
  // key misses: TYPO3 alias paths for the same article (/nachrichten/X vs
  // /pressemitteilungen/X) and the same article cross-indexed in multiple
  // system collections (e.g. Wahlprogramm chapters in both Beschlüsse and
  // Wahlprogramm). Sort already prefers newest, so the first occurrence wins.
  const seen = new Set<string>();
  const result: NotebookRecentDocumentCard[] = [];
  for (const card of cards) {
    const urlKey = card.url ? `url:${card.url}` : null;
    const titleKey = `title:${card.title}`;
    if (urlKey && seen.has(urlKey)) continue;
    if (seen.has(titleKey)) continue;
    if (urlKey) seen.add(urlKey);
    seen.add(titleKey);
    result.push(card);
  }
  return result;
}
