/**
 * Die öffentliche Vorlagen-Galerie: veröffentlichte, unmoderierte
 * `user_templates`. Eine Abfrage für `/auth/vorlagen` (über
 * `buildGalleryTemplates`, das die alte Form daraus baut), die Favoriten-
 * Auflösung, die beliebten Vorlagen und den Marktplatz.
 */
import { type GroupAudience } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('galleryTemplates');

export interface GalleryFilters {
  searchTerm?: string;
  searchMode?: string;
  templateType?: string;
  tags?: string;
  /**
   * When set, restrict the gallery to templates targeted at this locale plus
   * the locale-agnostic 'all'. Omit to return templates for every audience
   * (used by the favorites lookup, and when the user turns the locale filter off).
   */
  audience?: 'de-DE' | 'de-AT';
  /** Only these user_templates ids (UUIDs). */
  ids?: string[];
  /** Defaults to 100. */
  limit?: number;
  offset?: number;
  /** `new` (default): newest first. `popular`: most likes, then newest. */
  sort?: 'new' | 'popular';
}

export interface GalleryTemplateRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  templateType: string | null;
  thumbnailUrl: string | null;
  externalUrl: string | null;
  images: unknown[];
  categories: string[];
  tags: string[];
  contentData: Record<string, unknown>;
  metadata: Record<string, unknown>;
  audience: GroupAudience;
  createdAt: Date;
  updatedAt: Date;
  authorName: string | null;
  likesCount: number;
}

interface DbRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  template_type: string | null;
  thumbnail_url: string | null;
  external_url: string | null;
  images: unknown[] | null;
  categories: string[] | null;
  tags: string[] | null;
  content_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  audience: GroupAudience | null;
  created_at: Date;
  updated_at: Date;
  author_name: string | null;
  likes_count: number | string;
}

export async function listGalleryTemplates(
  filters: GalleryFilters = {}
): Promise<GalleryTemplateRow[]> {
  const {
    searchTerm = '',
    searchMode = 'title',
    templateType,
    tags,
    audience,
    ids,
    limit = 100,
    offset = 0,
    sort = 'new',
  } = filters;

  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const conditions = ['t.is_private = $1', 't.status = $2', "t.moderation = 'ok'"];
  const params: unknown[] = [false, 'published'];
  let paramIndex = 3;

  if (audience) {
    // Include locale-agnostic ('all') templates alongside the viewer's locale.
    conditions.push(`t.audience IN ($${paramIndex}, 'all')`);
    params.push(audience);
    paramIndex++;
  }

  if (ids) {
    conditions.push(`t.id = ANY($${paramIndex++}::uuid[])`);
    params.push(ids);
  }

  if (templateType && templateType !== 'all') {
    conditions.push(`t.template_type = $${paramIndex++}`);
    params.push(templateType);
  }

  if (tags) {
    try {
      const tagsArray = JSON.parse(tags) as unknown[];
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        conditions.push(`t.tags @> $${paramIndex++}::jsonb`);
        params.push(JSON.stringify(tagsArray));
      }
    } catch {
      log.warn('[Vorlagen Gallery] Invalid tags JSON:', tags);
    }
  }

  if (searchTerm && String(searchTerm).trim().length > 0) {
    const term = `%${String(searchTerm).trim()}%`;
    if (searchMode === 'fulltext') {
      conditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(term);
    } else {
      conditions.push(`t.title ILIKE $${paramIndex}`);
      params.push(term);
    }
  }

  const orderBy =
    sort === 'popular' ? 'likes_count DESC, t.created_at DESC, t.id' : 't.created_at DESC, t.id';

  const query = `
      SELECT t.id, t.user_id, t.title, t.description, t.template_type, t.thumbnail_url,
             t.external_url, t.images, t.categories, t.tags, t.content_data, t.metadata,
             t.audience, t.created_at, t.updated_at,
             NULLIF(TRIM(p.display_name), '') AS author_name,
             (SELECT count(*)::int FROM entity_likes el
               WHERE el.entity_type = 'template' AND el.entity_id = t.id::text) AS likes_count
      FROM user_templates t
      LEFT JOIN profiles p ON p.id = t.user_id
      WHERE t.deleted_at IS NULL AND ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
  params.push(limit, offset);

  const rows = (await postgres.query(query, params, { table: 'user_templates' })) as DbRow[];

  return (rows || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description,
    templateType: r.template_type,
    thumbnailUrl: r.thumbnail_url,
    externalUrl: r.external_url,
    images: r.images || [],
    categories: r.categories || [],
    tags: r.tags || [],
    contentData: r.content_data || {},
    metadata: r.metadata || {},
    audience: r.audience || 'all',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    authorName: r.author_name,
    likesCount: Number(r.likes_count) || 0,
  }));
}
