/**
 * Template enrichment - fire-and-forget background pass run after a user
 * submits/edits a Vorlage (template).
 *
 * Two jobs, both best-effort (never throw to the caller):
 *   1. If the template has no description yet but has a preview image
 *      (thumbnail_url, pulled from Canva), run the existing vision service to
 *      generate a German, gallery-oriented description and store it. The user's
 *      own text, if present, is never overwritten.
 *   2. Embed `title + description + tags` via Mistral and upsert a single point
 *      into the `user_templates` Qdrant collection for later semantic search.
 *
 * Triggered via `void enrichTemplate(id).catch(...)` from the template routers,
 * mirroring the fire-and-forget pattern used for board agent tasks. A lost run
 * (e.g. server restart mid-flight) just leaves the description empty / vector
 * stale; it re-runs on the next edit.
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  indexUserTemplate,
  deleteUserTemplateVectors,
} from '../../database/services/QdrantService/indexing.js';
import { getQdrantInstance } from '../../database/services/QdrantService.js';
import { createLogger } from '../../utils/logger.js';
import { mistralEmbeddingService } from '../mistral/index.js';

const log = createLogger('templateEnrichment');

const COLLECTION_NAME = 'user_templates';

/**
 * Prompt for the on-demand vision description (triggered manually by the user
 * via the ✨ button in the template modals, see the describeImage route).
 */
export const TEMPLATE_DESCRIPTION_INSTRUCTION = `Du beschreibst eine grafische Vorlage (Sharepic/Grafik) für eine durchsuchbare Vorlagen-Galerie. Beschreibe in 2-4 Sätzen prägnant und sachlich, was auf dem Bild zu sehen ist: Motiv, Bildaufbau, dominante Farben, Stil und – falls vorhanden – den sichtbaren Text wörtlich. Nenne mögliche Einsatzzwecke (z. B. Ankündigung, Veranstaltung, Zitat). Keine Interpretation, keine Anrede, keine Aufzählungszeichen.`;

interface TemplateRow {
  id: string;
  user_id: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  template_type: string | null;
  status: string | null;
  is_private: boolean | null;
  tags: unknown;
}

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map((t) => String(t)) : [];
}

/**
 * Run the vision + embedding enrichment for a single template. Best-effort:
 * swallows all errors so the fire-and-forget caller is never affected.
 */
export async function enrichTemplate(templateId: string): Promise<void> {
  try {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const row = await postgres.queryOne<TemplateRow>(
      `SELECT id, user_id, title, description, thumbnail_url, template_type, status, is_private, tags
       FROM user_templates WHERE id = $1`,
      [templateId],
      { table: 'user_templates' }
    );

    if (!row) {
      log.warn(`Template ${templateId} not found for enrichment`);
      return;
    }

    // Descriptions are now authored by the user (optionally via the on-demand
    // ✨ vision button in the modals) — enrichment no longer generates them.
    const description = row.description;

    const tags = toTags(row.tags);
    const title = row.title ?? '';

    // Embedding + Qdrant upsert (skipped gracefully if Qdrant is down).
    const qdrant = getQdrantInstance();
    let indexed = false;
    if (qdrant.isAvailableSync() && qdrant.client) {
      try {
        const embedText = `${title}\n\n${description ?? ''}\n\n${tags.join(', ')}`.trim();
        const embedding = await mistralEmbeddingService.generateEmbedding(embedText);
        await indexUserTemplate(qdrant.client, COLLECTION_NAME, templateId, embedding, {
          user_id: row.user_id,
          template_type: row.template_type ?? 'template',
          status: row.status ?? 'published',
          is_private: row.is_private ?? false,
          tags,
          title,
        });
        indexed = true;
      } catch (error) {
        log.warn(`Embedding/upsert failed for template ${templateId}:`, error);
      }
    } else {
      log.warn(`Qdrant not available, skipping template ${templateId} indexing`);
    }

    // Persist the index marker.
    if (indexed) {
      await postgres.update(
        'user_templates',
        { vector_indexed_at: new Date().toISOString() },
        { id: templateId }
      );
    }

    log.debug(`Enriched template ${templateId} (indexed: ${indexed})`);
  } catch (error) {
    log.error(`Template enrichment failed for ${templateId}:`, error);
  }
}

export interface TemplateSearchHit {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  external_url: string | null;
  score: number;
}

/**
 * Semantic search over published, public Vorlagen. Embeds the query, runs a
 * vector search against the `user_templates` collection, then hydrates the
 * top hits with full rows from Postgres (preserving vector rank order). Returns
 * an empty list — never throws — when the query is empty or Qdrant is down, so
 * the @vorlagen picker degrades gracefully.
 */
export async function searchTemplates(query: string, limit = 15): Promise<TemplateSearchHit[]> {
  try {
    const trimmed = query.trim();
    const qdrant = getQdrantInstance();
    if (!trimmed || !qdrant.isAvailableSync() || !qdrant.client) return [];

    const queryEmbedding = await mistralEmbeddingService.generateEmbedding(trimmed);
    const searchResult = await qdrant.client.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      filter: {
        must: [
          { key: 'status', match: { value: 'published' } },
          { key: 'is_private', match: { value: false } },
        ],
      },
      limit,
      score_threshold: 0.2,
      with_payload: true,
    });

    const hits = searchResult as unknown as Array<{
      score: number;
      payload?: { template_id?: string };
    }>;
    const ranked = hits
      .map((h) => ({ id: h.payload?.template_id, score: h.score }))
      .filter((h): h is { id: string; score: number } => typeof h.id === 'string');
    if (ranked.length === 0) return [];

    const ids = ranked.map((r) => r.id);
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    const rows = await postgres.query<{
      id: string;
      title: string | null;
      description: string | null;
      thumbnail_url: string | null;
      external_url: string | null;
    }>(
      `SELECT id, title, description, thumbnail_url, external_url
       FROM user_templates
       WHERE status = 'published' AND is_private = false AND id = ANY($1)`,
      [ids],
      { table: 'user_templates' }
    );

    const scoreById = new Map(ranked.map((r) => [r.id, r.score]));
    return rows
      .map((row) => ({
        id: row.id,
        title: row.title ?? 'Vorlage',
        description: row.description,
        thumbnail_url: row.thumbnail_url,
        external_url: row.external_url,
        score: scoreById.get(row.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    log.warn('Template search failed:', error);
    return [];
  }
}

/**
 * Remove a template's vector from Qdrant. Best-effort.
 */
export async function deleteTemplateVector(templateId: string): Promise<void> {
  try {
    const qdrant = getQdrantInstance();
    if (qdrant.isAvailableSync() && qdrant.client) {
      await deleteUserTemplateVectors(qdrant.client, COLLECTION_NAME, templateId);
    }
  } catch (error) {
    log.warn(`Failed to delete vector for template ${templateId}:`, error);
  }
}
