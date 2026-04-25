/**
 * Notebook Recent Documents Controller
 *
 * Returns the most recently published documents for a system notebook collection
 * (or a union of collections for multi-source notebooks).
 *
 * Used by the notebook startpages to power the "Zuletzt hinzugefügt" section.
 */

import express, { type Response, type Request } from 'express';

import {
  getSystemCollectionConfig,
  applyDefaultFilter,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';

import type { ScrollPoint } from '../../database/services/QdrantService/operations/types.js';

const log = createLogger('notebookRecent');
const router = express.Router();

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
// Qdrant stores N chunks per article (chunk_index 0..N-1). We filter chunk_index=0
// so SCROLL_WINDOW counts articles, not chunks. 2500 covers every system LV
// collection in full (largest is hamburg-lv-presse ≈ 1948 articles).
const SCROLL_WINDOW = 2500;

interface RecentDocumentCard {
  id: string;
  collectionId: string;
  collectionName: string;
  title: string;
  snippet: string | null;
  url: string | null;
  publishedAt: string | null;
  sourceLabel: string | null;
}

function normalizeLimit(raw: unknown): number {
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
): RecentDocumentCard {
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

async function fetchRecentForCollection(
  collectionId: string,
  limit: number
): Promise<RecentDocumentCard[]> {
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

    const sorted = cards.sort((a: RecentDocumentCard, b: RecentDocumentCard) => {
      if (!a.publishedAt && !b.publishedAt) return 0;
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

    return dedupeByUrlOrTitle(sorted).slice(0, limit);
  } catch (error) {
    log.warn(
      `Recent scroll failed for ${collectionId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

function dedupeByUrlOrTitle(cards: RecentDocumentCard[]): RecentDocumentCard[] {
  // Dedup by URL AND by title. The title key catches duplicates that the URL
  // key misses: TYPO3 alias paths for the same article (/nachrichten/X vs
  // /pressemitteilungen/X) and the same article cross-indexed in multiple
  // system collections (e.g. Wahlprogramm chapters in both Beschlüsse and
  // Wahlprogramm). Sort already prefers newest, so the first occurrence wins.
  const seen = new Set<string>();
  const result: RecentDocumentCard[] = [];
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

router.get('/collections/:id/recent', async (req: Request<{ id: string }>, res: Response) => {
  const collectionId = req.params.id;
  const limit = normalizeLimit(req.query.limit);

  const cards = await fetchRecentForCollection(collectionId, limit);
  res.json({ collectionId, items: cards });
});

router.get('/recent', async (req: Request, res: Response) => {
  const raw = req.query.collections;
  const collectionIds = (typeof raw === 'string' ? raw : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (collectionIds.length === 0) {
    return res.json({ items: [] });
  }

  const limit = normalizeLimit(req.query.limit);
  const perCollection = Math.max(Math.ceil((limit * 2) / collectionIds.length), 4);

  const results = await Promise.all(
    collectionIds.map((id) => fetchRecentForCollection(id, perCollection))
  );

  const merged = results.flat().sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0;
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  const unique = dedupeByUrlOrTitle(merged).slice(0, limit);
  res.json({ items: unique });
});

export default router;
