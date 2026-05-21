/**
 * NotebookQdrantHelper - Notebook Collections specific Qdrant operations
 * Handles Notebook collection CRUD operations in Qdrant vector database
 */

import * as crypto from 'crypto';

import { generateSlugSuffix } from '@gruenerator/shared/utils';
import { v4 as uuidv4 } from 'uuid';

import { getSystemCollectionConfig } from '../../config/systemCollectionsConfig.js';
import { triggerPendingDocProcessing } from '../../services/document-services/DocumentProcessingService/index.js';
import { mistralEmbeddingService } from '../../services/mistral/index.js';
import { createLogger } from '../../utils/logger.js';

import { getPostgresInstance } from './PostgresService.js';
import { type QdrantService, getQdrantInstance } from './QdrantService/index.js';
import { QdrantOperations } from './QdrantService/operations/index.js';

import type { QdrantFilter } from './QdrantService/types.js';

const logger = createLogger('NotebookQdrantHelper');

// =============================================================================
// Type Interfaces
// =============================================================================

type PublicOwnership = 'owner' | 'public_data';

export type NotebookShareMode = 'private' | 'groups' | 'authenticated';
export type NotebookEditPolicy = 'owner_only' | 'group_admins' | 'all_members';
export type NotebookAudience = 'de-DE' | 'de-AT';

const NOTEBOOK_SHARE_MODES: readonly NotebookShareMode[] = ['private', 'groups', 'authenticated'];
const NOTEBOOK_EDIT_POLICIES: readonly NotebookEditPolicy[] = [
  'owner_only',
  'group_admins',
  'all_members',
];
const NOTEBOOK_AUDIENCES: readonly NotebookAudience[] = ['de-DE', 'de-AT'];

function normalizeShareMode(raw: unknown): NotebookShareMode {
  return NOTEBOOK_SHARE_MODES.includes(raw as NotebookShareMode)
    ? (raw as NotebookShareMode)
    : 'private';
}

function normalizeEditPolicy(raw: unknown): NotebookEditPolicy {
  return NOTEBOOK_EDIT_POLICIES.includes(raw as NotebookEditPolicy)
    ? (raw as NotebookEditPolicy)
    : 'owner_only';
}

// Default to 'de-DE' for unknown / legacy values. The boot-time
// backfillAudience migration rewrites any 'all' rows to the owner's actual
// locale, so this fallback only fires for the rare case of a row that escaped
// the backfill (e.g. created during the same boot cycle).
function normalizeAudience(raw: unknown): NotebookAudience {
  return NOTEBOOK_AUDIENCES.includes(raw as NotebookAudience) ? (raw as NotebookAudience) : 'de-DE';
}

interface NotebookCollectionData {
  id?: string;
  user_id: string;
  name: string;
  description?: string | null;
  custom_prompt?: string | null;
  selection_mode?: 'documents' | string;
  wolke_share_link_ids?: string[] | null;
  auto_sync?: boolean;
  remove_missing_on_sync?: boolean;
  is_active?: boolean;
  settings?: Record<string, unknown>;
  document_count?: number;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
  share_mode?: NotebookShareMode;
  edit_policy?: NotebookEditPolicy;
  /**
   * Locale audience for `share_mode='authenticated'` listings: the notebook
   * is hidden from authenticated viewers whose `profiles.locale` doesn't
   * match. Owners and explicit group-share recipients always bypass the
   * filter. Defaults to the creator's locale on create.
   */
  audience?: NotebookAudience;
  /**
   * 6-char URL-safe tail used in Notion-style slugs (`my-notes-Ab3xK9`).
   * Assigned at creation, immutable afterwards — rename rewrites the name
   * prefix but never the suffix, so shared URLs survive renames. `null` only
   * appears for legacy rows in the transient window before the boot-time
   * backfill (apps/api/services/migrations/backfillNotebookSlugSuffixes.ts)
   * has run; if such a row is edited before backfill, storeNotebookCollection
   * mints a fresh suffix.
   */
  slug_suffix?: string | null;
}

interface NotebookCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  custom_prompt: string | null;
  selection_mode: string;
  wolke_share_link_ids: string[];
  auto_sync: boolean;
  remove_missing_on_sync: boolean;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  document_count: number;
  last_used_at: string | null;
  is_public: boolean;
  public_ownership: PublicOwnership | null;
  share_mode: NotebookShareMode;
  edit_policy: NotebookEditPolicy;
  audience: NotebookAudience;
  slug_suffix: string | null;
  notebook_collection_documents?: CollectionDocument[];
}

interface CollectionDocument {
  document_id: string;
  added_at: string;
  added_by: string | null;
}

interface PublicAccessData {
  collection_id: string;
  access_token: string;
  created_at: string;
  expires_at: string | null;
  created_by: string | null;
  is_active: boolean;
  view_count: number;
  last_accessed_at: string | null;
}

interface UsageLogMetadata {
  ip_address?: string | null;
  user_agent?: string | null;
  apiKeyId?: string | null;
  landesverband?: string | null;
}

interface BulkDeleteResult {
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
}

interface GetCollectionsOptions {
  limit?: number;
  offset?: number;
}

interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

interface ScrollPoint {
  id: string | number;
  payload: Record<string, unknown>;
}

// =============================================================================
// NotebookQdrantHelper Class
// =============================================================================

class NotebookQdrantHelper {
  private qdrant: QdrantService;
  private qdrantOps: QdrantOperations | null;
  private initialized: boolean;

  constructor() {
    this.qdrant = getQdrantInstance();
    this.qdrantOps = null;
    this.initialized = false;
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.qdrant.init();
      this.qdrantOps = new QdrantOperations(this.qdrant.client!);
      this.initialized = true;
    }
  }

  /**
   * Generate numeric ID from UUID
   */
  generateNumericId(uuid: string): number {
    const hash = crypto.createHash('sha256').update(uuid).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Generate dummy vector for non-vector collections
   */
  generateDummyVector(): number[] {
    return new Array<number>(this.qdrant.vectorSize || 1024).fill(0.1);
  }

  /**
   * Generate embedding for Notebook collection metadata
   */
  async generateCollectionEmbedding(
    name: string,
    description: string = '',
    customPrompt: string = ''
  ): Promise<number[]> {
    await mistralEmbeddingService.init();
    const text = `${name} ${description} ${customPrompt}`.trim();
    return await mistralEmbeddingService.generateEmbedding(text);
  }

  /**
   * Store Notebook collection in Qdrant
   */
  async storeNotebookCollection(
    collectionData: NotebookCollectionData
  ): Promise<{ success: boolean; collection_id: string }> {
    await this.ensureInitialized();

    try {
      const collectionId = collectionData.id || uuidv4();
      const embedding = await this.generateCollectionEmbedding(
        collectionData.name,
        collectionData.description || '',
        collectionData.custom_prompt || ''
      );

      // Slug suffix: keep an existing one if provided (preserves stability on
      // rename), otherwise mint a fresh collision-free 6-char tail. The chance
      // of a real collision at 56^6 ≈ 30 billion is negligible, but probing
      // once is cheap and matches the share_token uniqueness pattern.
      const slugSuffix = collectionData.slug_suffix ?? (await this.allocateFreshSlugSuffix());

      const point: QdrantPoint = {
        id: this.generateNumericId(collectionId),
        vector: embedding,
        payload: {
          collection_id: collectionId,
          user_id: collectionData.user_id,
          name: collectionData.name,
          description: collectionData.description || null,
          custom_prompt: collectionData.custom_prompt || null,
          selection_mode: collectionData.selection_mode || 'documents',
          wolke_share_link_ids: collectionData.wolke_share_link_ids || null,
          auto_sync: collectionData.auto_sync === true,
          remove_missing_on_sync: collectionData.remove_missing_on_sync === true,
          created_at: collectionData.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: collectionData.is_active !== false,
          settings: collectionData.settings || {},
          document_count: collectionData.document_count || 0,
          last_used_at: collectionData.last_used_at || null,
          is_public: collectionData.is_public === true,
          public_ownership: collectionData.public_ownership ?? null,
          share_mode: normalizeShareMode(collectionData.share_mode),
          edit_policy: normalizeEditPolicy(collectionData.edit_policy),
          audience: normalizeAudience(collectionData.audience),
          slug_suffix: slugSuffix,
        },
      };

      await this.qdrantOps!.batchUpsert(this.qdrant.collections.notebook_collections, [point]);

      logger.info(`Stored Notebook collection: ${collectionId}`);
      return { success: true, collection_id: collectionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error storing Notebook collection: ${message}`);
      throw new Error(`Failed to store Notebook collection: ${message}`);
    }
  }

  /**
   * Mint a slug suffix that isn't already claimed by another notebook.
   * Retries up to 5 times — at 56^6 the loop almost never iterates twice.
   */
  private async allocateFreshSlugSuffix(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateSlugSuffix();
      const existing = await this.getNotebookCollectionBySlugSuffix(candidate);
      if (!existing) return candidate;
    }
    // Statistically unreachable, but better than a silent dup.
    throw new Error('Failed to allocate unique slug suffix after 5 attempts');
  }

  /**
   * One-shot backfill: scan every notebook point and assign a fresh
   * `slug_suffix` to anything missing one. Idempotent — re-running after a
   * successful backfill is a no-op because matching points have a suffix.
   *
   * Reads payloads directly (instead of going through the public update path)
   * to avoid re-embedding 5k notebooks. Suffixes are uniqueness-checked via
   * the same allocateFreshSlugSuffix helper used at create time.
   */
  async backfillSlugSuffixes(): Promise<{ scanned: number; updated: number }> {
    await this.ensureInitialized();

    let scanned = 0;
    let updated = 0;

    // Single scroll with a large limit — notebook counts are O(thousands) per
    // tenant, so a windowed scroll isn't needed yet. If the dataset grows
    // beyond ~100k rows, switch to a paged scroll via the raw Qdrant client.
    const allResults = await this.qdrantOps!.scrollDocuments(
      this.qdrant.collections.notebook_collections,
      {},
      { limit: 100_000, withPayload: true }
    );

    for (const point of allResults) {
      scanned++;
      const existingSuffix = point.payload.slug_suffix;
      if (typeof existingSuffix === 'string' && existingSuffix.length > 0) continue;

      const fresh = await this.allocateFreshSlugSuffix();
      // Patch only the slug_suffix field via Qdrant's set_payload — leaves
      // the existing semantic embedding intact. A batchUpsert here would
      // require re-supplying the vector and silently overwrite each
      // notebook's embedding with zeros.
      await this.qdrantOps!.client.setPayload(this.qdrant.collections.notebook_collections, {
        payload: { slug_suffix: fresh },
        points: [point.id],
      });
      updated++;

      if (updated > 0 && updated % 50 === 0) {
        logger.info(`[backfillSlugSuffixes] Progress: ${updated} slugs assigned`);
      }
    }

    logger.info(`[backfillSlugSuffixes] Done. scanned=${scanned} updated=${updated}`);
    return { scanned, updated };
  }

  /**
   * One-shot backfill: rewrite legacy `audience='all'` (or missing-audience)
   * notebook rows to the owner's actual locale, looked up once per distinct
   * user_id from `profiles.locale`. Idempotent — a row whose audience is
   * already 'de-DE' or 'de-AT' is skipped.
   *
   * Patches via `setPayload` so we don't re-embed thousands of notebooks.
   */
  async backfillAudience(): Promise<{ scanned: number; updated: number }> {
    await this.ensureInitialized();

    let scanned = 0;
    let updated = 0;

    const allResults = await this.qdrantOps!.scrollDocuments(
      this.qdrant.collections.notebook_collections,
      {},
      { limit: 100_000, withPayload: true }
    );

    const targets: Array<{ id: string | number; userId: string }> = [];
    for (const point of allResults) {
      scanned++;
      const audience = point.payload.audience;
      if (audience === 'de-DE' || audience === 'de-AT') continue;
      const userId = point.payload.user_id;
      if (typeof userId !== 'string' || userId.length === 0) continue;
      targets.push({ id: point.id, userId });
    }

    if (targets.length === 0) {
      logger.info(`[backfillAudience] Nothing to backfill. scanned=${scanned}`);
      return { scanned, updated };
    }

    const userIds = Array.from(new Set(targets.map((t) => t.userId)));
    const postgres = getPostgresInstance();
    const rows = await postgres.query<{ id: string; locale: string | null }>(
      'SELECT id::text AS id, locale FROM profiles WHERE id::text = ANY($1)',
      [userIds]
    );
    const localeByUser = new Map<string, NotebookAudience>();
    for (const row of rows) {
      localeByUser.set(row.id, row.locale === 'de-AT' ? 'de-AT' : 'de-DE');
    }

    for (const target of targets) {
      const newAudience: NotebookAudience = localeByUser.get(target.userId) ?? 'de-DE';
      await this.qdrantOps!.client.setPayload(this.qdrant.collections.notebook_collections, {
        payload: { audience: newAudience },
        points: [target.id],
      });
      updated++;
      if (updated > 0 && updated % 50 === 0) {
        logger.info(`[backfillAudience] Progress: ${updated} rows updated`);
      }
    }

    logger.info(`[backfillAudience] Done. scanned=${scanned} updated=${updated}`);
    return { scanned, updated };
  }

  /**
   * Resolve a notebook by its Notion-style slug tail (the 6-char suffix
   * after the last `-` in URLs like `/notebooks/my-research-Ab3xK9`).
   * Returns null when no notebook has that suffix.
   */
  async getNotebookCollectionBySlugSuffix(slugSuffix: string): Promise<NotebookCollection | null> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'slug_suffix', match: { value: slugSuffix } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit: 1, withPayload: true }
      );

      if (results.length === 0) return null;
      return this.formatCollectionFromPayload(results[0].payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting Notebook collection by slug suffix: ${message}`);
      return null;
    }
  }

  /**
   * Get Notebook collection by ID
   */
  async getNotebookCollection(collectionId: string): Promise<NotebookCollection | null> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit: 1, withPayload: true }
      );

      if (results.length === 0) {
        return null;
      }

      return this.formatCollectionFromPayload(results[0].payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting Notebook collection: ${message}`);
      throw new Error(`Failed to get Notebook collection: ${message}`);
    }
  }

  /**
   * Get user's Notebook collections
   */
  async getUserNotebookCollections(
    userId: string,
    options: GetCollectionsOptions = {}
  ): Promise<NotebookCollection[]> {
    await this.ensureInitialized();

    try {
      const { limit = 100, offset = 0 } = options;

      const filter: QdrantFilter = {
        must: [{ key: 'user_id', match: { value: userId } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit, offset, withPayload: true }
      );

      const collections = results.map((result: ScrollPoint) =>
        this.formatCollectionFromPayload(result.payload)
      );

      // Get document associations for each collection
      for (const collection of collections) {
        const documents = await this.getCollectionDocuments(collection.id);
        collection.notebook_collection_documents = documents;
        collection.document_count = documents.length;
      }

      return collections;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting user Notebook collections: ${message}`);
      throw new Error(`Failed to get user Notebook collections: ${message}`);
    }
  }

  /**
   * List every collection with `auto_sync=true`, across all users. Used by the
   * hourly Wolke folder watcher (WolkeWatchService) to find notebooks to scan.
   *
   * Deliberately skips the per-collection document-association lookup that
   * getUserNotebookCollections does — the watcher only needs the share-link IDs,
   * and the hourly scan should stay cheap. `document_count` is left as the
   * stored payload value (unused by the watcher).
   */
  async getNotebookCollectionsByAutoSync(
    options: GetCollectionsOptions = {}
  ): Promise<NotebookCollection[]> {
    await this.ensureInitialized();

    try {
      const { limit = 1000, offset = 0 } = options;

      const filter: QdrantFilter = {
        must: [{ key: 'auto_sync', match: { value: true } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit, offset, withPayload: true }
      );

      return results.map((result: ScrollPoint) => this.formatCollectionFromPayload(result.payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting auto_sync Notebook collections: ${message}`);
      throw new Error(`Failed to get auto_sync Notebook collections: ${message}`);
    }
  }

  /**
   * Update Notebook collection
   */
  async updateNotebookCollection(
    collectionId: string,
    updateData: Partial<NotebookCollectionData>
  ): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    try {
      // First get existing collection
      const existingCollection = await this.getNotebookCollection(collectionId);
      if (!existingCollection) {
        throw new Error('Notebook collection not found');
      }

      // Merge with updates
      const updatedData: NotebookCollectionData = {
        ...existingCollection,
        ...updateData,
        id: collectionId,
        updated_at: new Date().toISOString(),
      };

      // Store updated collection
      await this.storeNotebookCollection(updatedData);

      logger.info(`Updated Notebook collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error updating Notebook collection: ${message}`);
      throw new Error(`Failed to update Notebook collection: ${message}`);
    }
  }

  /**
   * Delete Notebook collection
   */
  async deleteNotebookCollection(collectionId: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    try {
      // Delete collection
      const collectionFilter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };
      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_collections,
        collectionFilter
      );

      // Delete document associations
      const docsFilter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };
      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_collection_documents,
        docsFilter
      );

      // Delete public access tokens
      const accessFilter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };
      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_public_access,
        accessFilter
      );

      logger.info(`Deleted Notebook collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error deleting Notebook collection: ${message}`);
      throw new Error(`Failed to delete Notebook collection: ${message}`);
    }
  }

  /**
   * Add documents to a Notebook collection.
   *
   * Also kicks off deferred processing for any attached docs still at
   * status='uploaded'. The SQL filter inside `triggerPendingDocProcessing`
   * is the natural gate — already-processed docs (e.g. Wolke imports at
   * status='completed') are a no-op. Skipped when `addedBy` is null because
   * the processing query needs a user_id.
   */
  async addDocumentsToCollection(
    collectionId: string,
    documentIds: string[],
    addedBy: string | null = null
  ): Promise<{ success: boolean; added_count: number }> {
    await this.ensureInitialized();

    try {
      const points: QdrantPoint[] = documentIds.map((documentId) => ({
        id: this.generateNumericId(`${collectionId}_${documentId}`),
        vector: this.generateDummyVector(),
        payload: {
          collection_id: collectionId,
          document_id: documentId,
          added_at: new Date().toISOString(),
          added_by: addedBy,
        },
      }));

      await this.qdrantOps!.batchUpsert(
        this.qdrant.collections.notebook_collection_documents,
        points
      );

      logger.info(`Added ${documentIds.length} documents to collection: ${collectionId}`);

      if (addedBy && documentIds.length > 0) {
        await triggerPendingDocProcessing({
          documentIds,
          userId: addedBy,
          logScope: 'NotebookQdrantHelper.addDocumentsToCollection',
          collectionId,
        });
      }

      return { success: true, added_count: documentIds.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error adding documents to collection: ${message}`);
      throw new Error(`Failed to add documents to collection: ${message}`);
    }
  }

  /**
   * Remove documents from Notebook collection
   */
  async removeDocumentsFromCollection(
    collectionId: string,
    documentIds: string[]
  ): Promise<{ success: boolean; removed_count: number }> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [
          { key: 'collection_id', match: { value: collectionId } },
          { key: 'document_id', match: { any: documentIds } },
        ],
      };

      await this.qdrantOps!.batchDelete(
        this.qdrant.collections.notebook_collection_documents,
        filter
      );

      logger.info(`Removed ${documentIds.length} documents from collection: ${collectionId}`);
      return { success: true, removed_count: documentIds.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error removing documents from collection: ${message}`);
      throw new Error(`Failed to remove documents from collection: ${message}`);
    }
  }

  /**
   * Get documents associated with a Notebook collection
   */
  async getCollectionDocuments(collectionId: string): Promise<CollectionDocument[]> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { value: collectionId } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collection_documents,
        filter,
        { limit: 1000, withPayload: true }
      );

      return results.map((result: ScrollPoint) => ({
        document_id: result.payload.document_id as string,
        added_at: result.payload.added_at as string,
        added_by: result.payload.added_by as string | null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting collection documents: ${message}`);
      return [];
    }
  }

  /**
   * Get public access by token
   *
   * Token creation/revocation was removed when the notebook share model moved
   * to share_mode + edit_policy + group_content_shares. Existing tokens in the
   * Qdrant `notebook_public_access` collection still resolve here so previously
   * issued public links keep working until they expire or are cleaned up.
   */
  async getPublicAccess(accessToken: string): Promise<PublicAccessData | null> {
    await this.ensureInitialized();

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'access_token', match: { value: accessToken } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_public_access,
        filter,
        { limit: 1, withPayload: true }
      );

      if (results.length === 0) {
        return null;
      }

      const payload = results[0].payload;
      return {
        collection_id: payload.collection_id as string,
        access_token: payload.access_token as string,
        created_at: payload.created_at as string,
        expires_at: payload.expires_at as string | null,
        created_by: payload.created_by as string | null,
        is_active: payload.is_active as boolean,
        view_count: payload.view_count as number,
        last_accessed_at: payload.last_accessed_at as string | null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting public access: ${message}`);
      throw new Error(`Failed to get public access: ${message}`);
    }
  }

  /**
   * Log Notebook usage
   */
  async logNotebookUsage(
    collectionId: string,
    userId: string | null,
    question: string,
    answerLength: number,
    responseTime: number,
    metadata: UsageLogMetadata = {}
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureInitialized();

    try {
      // Generate embedding for the question for analytics
      await mistralEmbeddingService.init();
      const questionEmbedding = await mistralEmbeddingService.generateEmbedding(question);

      const point: QdrantPoint = {
        id: this.generateNumericId(uuidv4()),
        vector: questionEmbedding,
        payload: {
          collection_id: collectionId,
          user_id: userId,
          question: question,
          answer_length: answerLength,
          response_time_ms: responseTime,
          created_at: new Date().toISOString(),
          ip_address: metadata.ip_address || null,
          user_agent: metadata.user_agent || null,
          api_key_id: metadata.apiKeyId || null,
          landesverband: metadata.landesverband || null,
        },
      };

      await this.qdrantOps!.batchUpsert(this.qdrant.collections.notebook_usage_logs, [point]);

      logger.info(`Logged Notebook usage for collection: ${collectionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error logging Notebook usage: ${message}`);
      // Don't throw error for logging failures
      return { success: false, error: message };
    }
  }

  /**
   * Format collection data from Qdrant payload
   */
  formatCollectionFromPayload(payload: Record<string, unknown>): NotebookCollection {
    const rawOwnership = payload.public_ownership;
    const publicOwnership: PublicOwnership | null =
      rawOwnership === 'owner' || rawOwnership === 'public_data' ? rawOwnership : null;

    return {
      id: payload.collection_id as string,
      user_id: payload.user_id as string,
      name: payload.name as string,
      description: payload.description as string | null,
      custom_prompt: payload.custom_prompt as string | null,
      selection_mode: (payload.selection_mode as string) || 'documents',
      wolke_share_link_ids: (payload.wolke_share_link_ids as string[]) || [],
      auto_sync: !!payload.auto_sync,
      remove_missing_on_sync: !!payload.remove_missing_on_sync,
      created_at: payload.created_at as string,
      updated_at: payload.updated_at as string,
      is_active: payload.is_active as boolean,
      settings: (payload.settings as Record<string, unknown>) || {},
      document_count: (payload.document_count as number) || 0,
      last_used_at: payload.last_used_at as string | null,
      is_public: payload.is_public === true,
      public_ownership: publicOwnership,
      share_mode: normalizeShareMode(payload.share_mode),
      edit_policy: normalizeEditPolicy(payload.edit_policy),
      audience: normalizeAudience(payload.audience),
      slug_suffix:
        typeof payload.slug_suffix === 'string' && payload.slug_suffix.length > 0
          ? payload.slug_suffix
          : null,
    };
  }

  /**
   * Fetch notebook collections by an explicit list of IDs.
   * Used by listAccessibleCollections to materialize group-shared notebooks.
   */
  async getNotebookCollectionsByIds(collectionIds: string[]): Promise<NotebookCollection[]> {
    await this.ensureInitialized();
    if (collectionIds.length === 0) return [];

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'collection_id', match: { any: collectionIds } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit: Math.max(collectionIds.length, 100), withPayload: true }
      );

      const collections = results.map((result: ScrollPoint) =>
        this.formatCollectionFromPayload(result.payload)
      );

      for (const collection of collections) {
        const documents = await this.getCollectionDocuments(collection.id);
        collection.notebook_collection_documents = documents;
        collection.document_count = documents.length;
      }

      return collections;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error fetching notebook collections by ids: ${message}`);
      return [];
    }
  }

  /**
   * Fetch notebook collections by share_mode (e.g., 'authenticated').
   * Lets listAccessibleCollections surface notebooks readable to any logged-in
   * user without per-id lookups.
   */
  async getNotebookCollectionsByShareMode(
    shareMode: NotebookShareMode,
    options: GetCollectionsOptions = {}
  ): Promise<NotebookCollection[]> {
    await this.ensureInitialized();

    try {
      const { limit = 200, offset = 0 } = options;

      const filter: QdrantFilter = {
        must: [{ key: 'share_mode', match: { value: shareMode } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit, offset, withPayload: true }
      );

      return results.map((result: ScrollPoint) => this.formatCollectionFromPayload(result.payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error fetching notebook collections by share_mode: ${message}`);
      return [];
    }
  }

  /**
   * List all notebook collections marked is_public=true across all users.
   * Powers the "Von der Basis" community section on /notebooks. `is_public`
   * is a discovery flag orthogonal to `share_mode`; access is still governed
   * by `checkNotebookAccess`, which requires share_mode='authenticated' (or
   * group membership) for non-owner reads.
   */
  async getPublicNotebookCollections(
    options: GetCollectionsOptions = {}
  ): Promise<NotebookCollection[]> {
    await this.ensureInitialized();

    try {
      const { limit = 200, offset = 0 } = options;

      const filter: QdrantFilter = {
        must: [{ key: 'is_public', match: { value: true } }],
      };

      const results = await this.qdrantOps!.scrollDocuments(
        this.qdrant.collections.notebook_collections,
        filter,
        { limit, offset, withPayload: true }
      );

      return results.map((result) => this.formatCollectionFromPayload(result.payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error listing public Notebook collections: ${message}`);
      throw new Error(`Failed to list public Notebook collections: ${message}`);
    }
  }

  /**
   * Bulk delete collections
   */
  async bulkDeleteCollections(
    collectionIds: string[],
    userId: string
  ): Promise<{ success: boolean; results: BulkDeleteResult }> {
    await this.ensureInitialized();

    try {
      const results: BulkDeleteResult = { deleted: [], failed: [] };

      for (const collectionId of collectionIds) {
        try {
          // Verify ownership
          const collection = await this.getNotebookCollection(collectionId);
          if (!collection || collection.user_id !== userId) {
            results.failed.push({ id: collectionId, error: 'Not found or access denied' });
            continue;
          }

          await this.deleteNotebookCollection(collectionId);
          results.deleted.push(collectionId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.failed.push({ id: collectionId, error: message });
        }
      }

      return { success: true, results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error in bulk delete: ${message}`);
      throw new Error(`Bulk delete failed: ${message}`);
    }
  }

  /**
   * Create the system Grundsatz collection if it doesn't exist
   */
  async ensureSystemGrundsatzCollection(): Promise<{
    success: boolean;
    collection_id: string;
    created: boolean;
  }> {
    await this.ensureInitialized();

    const config = getSystemCollectionConfig('grundsatz-system');
    if (!config) throw new Error('System collection config not found for grundsatz-system');
    const systemCollectionId = config.id;

    try {
      // Check if the system collection already exists
      const existingCollection = await this.getNotebookCollection(systemCollectionId);
      if (existingCollection) {
        logger.info(`System Grundsatz collection already exists: ${systemCollectionId}`);
        return { success: true, collection_id: systemCollectionId, created: false };
      }

      // Import COMPREHENSIVE_DOSSIER_INSTRUCTIONS
      const { COMPREHENSIVE_DOSSIER_INSTRUCTIONS } = await import('../../utils/prompt/index.js');

      // Create the system Grundsatz collection using centralized config
      const systemCollectionData: NotebookCollectionData = {
        id: systemCollectionId,
        user_id: 'SYSTEM',
        name: config.name,
        description: config.description,
        custom_prompt: COMPREHENSIVE_DOSSIER_INSTRUCTIONS,
        selection_mode: 'documents',
        is_active: true,
        settings: {
          min_quality: config.minQuality,
          system_collection: true,
          allow_public: false,
        },
        created_at: new Date().toISOString(),
      };

      const result = await this.storeNotebookCollection(systemCollectionData);
      logger.info(`Created system Grundsatz collection: ${systemCollectionId}`);
      return { ...result, created: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error creating system Grundsatz collection: ${message}`);
      throw new Error(`Failed to create system Grundsatz collection: ${message}`);
    }
  }
}

export { NotebookQdrantHelper };
export type {
  NotebookCollectionData,
  NotebookCollection,
  CollectionDocument,
  PublicAccessData,
  UsageLogMetadata,
  BulkDeleteResult,
  GetCollectionsOptions,
};
