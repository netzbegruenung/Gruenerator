/**
 * Unified Examples Search Service
 *
 * Single entry point for fetching example content (social-media posts,
 * Landesverband press releases, …) used as templates by content-creation
 * agents. Callers specify which `kinds` they want; the service fans out to the
 * underlying collections in parallel and returns a normalized result with a
 * `kind` discriminator on each item.
 *
 * Adding a new kind (antrag, position, rede, …) is a one-line dispatch case
 * here plus an entry in the `ExampleKind` union — no graph or UI churn.
 */

import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';
import { contentExamplesService } from '../contentExamplesService.js';
import { DocumentSearchService } from '../document-services/index.js';

import type { QdrantFilter } from '../../database/services/QdrantService/types.js';
import type { DocumentResult } from '../BaseSearchService/types.js';

const log = createLogger('ExampleSearch');

export type ExampleKind = 'social' | 'press';

export interface UnifiedExample {
  kind: ExampleKind;
  id: string;
  title: string;
  body: string;
  platform?: string; // social only
  author?: string; // social only
  lv?: string; // press only
  publishedAt?: string;
  url?: string;
  sourceId?: string;
  relevance: number;
}

export interface SearchExamplesParams {
  query: string;
  kinds: ExampleKind[];
  country?: 'DE' | 'AT';
  platform?: string;
  limit?: number;
  // When true, social examples are returned with full body text instead of the
  // 500-char preview. Used by the social-media composer node so the prompt
  // sees full Insta captions / FB posts; the legacy direct-executor wrapper
  // and any UI-summary callers keep the truncated default.
  fullBody?: boolean;
}

export interface SearchExamplesResult {
  byKind: Partial<Record<ExampleKind, UnifiedExample[]>>;
  all: UnifiedExample[];
  errors: Partial<Record<ExampleKind, string>>;
}

const documentSearchService = new DocumentSearchService();

// Locale-aware press source map. AT users get gruene.at /news/ content
// (Austrian Greens publish press releases under /news/, not a separate /presse/
// hierarchy — gruene.at's /presse/ page is just a media-contact landing).
// DE users get the Landesverband press collection.
interface PressSource {
  collection: string;
  contentType: string;
  lvLabelOverride?: string;
}
const PRESS_SOURCES: Record<'DE' | 'AT', PressSource> = {
  DE: { collection: 'landesverbaende_documents', contentType: 'presse' },
  AT: { collection: 'gruene_at_documents', contentType: 'news', lvLabelOverride: 'AT' },
};

function pressFilter(contentType: string): QdrantFilter {
  return { must: [{ key: 'content_type', match: { value: contentType } }] };
}

const lvShortNameMap: Record<string, string> = {
  berlin: 'BE',
  hamburg: 'HH',
  thueringen: 'TH',
  'mecklenburg-vorpommern': 'MV',
  brandenburg: 'BB',
  bayern: 'BY',
  'schleswig-holstein': 'SH',
};

function lvShortNameFromSourceId(sourceId: string | undefined): string {
  if (!sourceId) return '';
  const twoSeg = sourceId.split('-').slice(0, 2).join('-');
  const prefix = sourceId.split('-')[0];
  return lvShortNameMap[twoSeg] ?? lvShortNameMap[prefix] ?? '';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

async function fetchSocial(params: SearchExamplesParams): Promise<UnifiedExample[]> {
  const { query, platform, country, limit = 10, fullBody = false } = params;

  let results = await contentExamplesService.searchSocialMediaExamples(query, {
    platform: platform as 'facebook' | 'instagram' | null,
    limit,
    threshold: 0.15,
    country: country ?? null,
  });

  // Mirror the existing fallback-to-random behaviour from
  // executeDirectExamplesSearch so the wrapper there can stay shape-faithful.
  if (!results || results.length === 0) {
    results = await contentExamplesService.getRandomSocialMediaExamples({
      platform: platform as 'facebook' | 'instagram' | null,
      limit: Math.min(limit, 5),
      country: country ?? null,
    });
  }

  return (results ?? []).map((r) => {
    const platformName = r.platform || platform || 'unknown';
    const author = r.source_account;
    return {
      kind: 'social' as const,
      id: String(r.id),
      title: `${platformName} Beispiel${author ? ` von ${author}` : ''}`,
      body: fullBody ? r.content || '' : truncate(r.content || '', 500),
      platform: platformName,
      ...(author && { author }),
      ...(r.created_at && { publishedAt: r.created_at }),
      relevance: typeof r.score === 'number' ? r.score : 0.8,
    };
  });
}

async function fetchFullPmBodies(
  documentIds: string[],
  source: PressSource
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (documentIds.length === 0) return result;

  try {
    const qdrant = getQdrantInstance();
    const ops = qdrant.operations;
    if (!ops) return result;

    const filter: QdrantFilter = {
      must: [
        { key: 'content_type', match: { value: source.contentType } },
        { key: 'document_id', match: { any: documentIds } },
      ],
    };
    // ~50 chunks per PM is generous; most LV PMs are 1-5 chunks.
    const chunks = await ops.scrollDocuments(source.collection, filter, {
      limit: documentIds.length * 50,
      withPayload: true,
      withVector: false,
    });

    const byDoc = new Map<string, Array<{ idx: number; text: string }>>();
    for (const c of chunks) {
      const docId = c.payload.document_id;
      const text = c.payload.chunk_text;
      const idx = c.payload.chunk_index;
      if (typeof docId !== 'string' || typeof text !== 'string') continue;
      if (!byDoc.has(docId)) byDoc.set(docId, []);
      byDoc.get(docId)!.push({ idx: typeof idx === 'number' ? idx : 0, text });
    }
    for (const [docId, parts] of byDoc) {
      parts.sort((a, b) => a.idx - b.idx);
      const full = parts
        .map((p) => p.text.trim())
        .filter((t) => t.length > 0)
        .join('\n\n');
      if (full) result.set(docId, full);
    }
    log.info(
      `[ExampleSearch] press body reconstruction: ${documentIds.length} docs → ${result.size} reconstructed (${chunks.length} chunks)`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`[ExampleSearch] press body reconstruction failed: ${msg}`);
  }

  return result;
}

async function fetchPress(params: SearchExamplesParams): Promise<UnifiedExample[]> {
  const { query, limit = 6, country } = params;
  const source = country === 'AT' ? PRESS_SOURCES.AT : PRESS_SOURCES.DE;

  log.info(
    `[ExampleSearch] press source: country=${country ?? 'DE'} → ${source.collection} (content_type=${source.contentType})`
  );

  const response = await documentSearchService.search({
    query,
    userId: undefined,
    options: {
      limit,
      mode: 'hybrid',
      searchCollection: source.collection,
      threshold: 0.2,
      additionalFilter: pressFilter(source.contentType),
    },
  });

  if (!response.success || !response.results || response.results.length === 0) {
    return [];
  }

  // Dedupe by title and collect doc_ids for full-body reconstruction
  const seenTitles = new Set<string>();
  const dedupedHits: Array<{ r: DocumentResult; docId: string | null }> = [];
  for (const r of response.results as DocumentResult[]) {
    const title = r.title ?? 'Pressemitteilung';
    if (seenTitles.has(title)) continue;
    seenTitles.add(title);
    const docId = r.document_id != null ? String(r.document_id) : null;
    dedupedHits.push({ r, docId });
  }

  const fullBodies = await fetchFullPmBodies(
    dedupedHits.map((h) => h.docId).filter((id): id is string => id !== null),
    source
  );

  const out: UnifiedExample[] = [];
  for (const { r, docId } of dedupedHits) {
    const title = r.title ?? 'Pressemitteilung';
    const sourceId = r.source_id ?? undefined;
    // For AT, all content is from gruene.at — there's no Landesverband
    // breakdown, so use the source's static label. For DE, derive the LV
    // short-name (BE/HH/...) from source_id as before.
    const lv = source.lvLabelOverride ?? lvShortNameFromSourceId(sourceId);
    const publishedAt = r.published_at ?? undefined;
    const url = r.source_url ?? undefined;
    const fullBody = docId ? fullBodies.get(docId) : undefined;
    // Prefer reconstructed full text; fall back to the matched chunk.
    const body = fullBody ?? r.relevant_content ?? '';

    out.push({
      kind: 'press' as const,
      id: String(docId ?? title),
      title,
      body,
      lv,
      ...(sourceId && { sourceId }),
      ...(publishedAt && { publishedAt }),
      ...(url && { url }),
      relevance: typeof r.similarity_score === 'number' ? r.similarity_score : 0.85,
    });
  }
  return out;
}

const FETCHERS: Record<ExampleKind, (params: SearchExamplesParams) => Promise<UnifiedExample[]>> = {
  social: fetchSocial,
  press: fetchPress,
};

export async function searchExamples(params: SearchExamplesParams): Promise<SearchExamplesResult> {
  const uniqueKinds = Array.from(new Set(params.kinds));
  if (uniqueKinds.length === 0) {
    log.warn('[ExampleSearch] called with empty kinds[]');
    return { byKind: {}, all: [], errors: {} };
  }

  log.info(
    `[ExampleSearch] kinds=[${uniqueKinds.join(',')}] query="${params.query.slice(0, 80)}"${
      params.country ? ` country=${params.country}` : ''
    }${params.platform ? ` platform=${params.platform}` : ''}`
  );

  const settled = await Promise.allSettled(
    uniqueKinds.map((kind) => FETCHERS[kind](params).then((items) => ({ kind, items })))
  );

  const byKind: Partial<Record<ExampleKind, UnifiedExample[]>> = {};
  const errors: Partial<Record<ExampleKind, string>> = {};
  const all: UnifiedExample[] = [];

  settled.forEach((res, idx) => {
    const kind = uniqueKinds[idx];
    if (res.status === 'fulfilled') {
      byKind[kind] = res.value.items;
      all.push(...res.value.items);
      log.info(`[ExampleSearch] ${kind} → ${res.value.items.length} items`);
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      errors[kind] = msg;
      log.error(`[ExampleSearch] ${kind} failed: ${msg}`);
    }
  });

  return { byKind, all, errors };
}
