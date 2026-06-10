/**
 * ts-rest contract router for /api/auth/notebook-collections (CRUD routes).
 *
 * Contract-driven router from @ts-rest/express wrapping NotebookQdrantHelper
 * + service calls. Sole handler for these routes (the legacy
 * collectionsController has been removed).
 *
 * ## Authentication
 * All routes require authentication. `requireAuth` middleware is applied at
 * the path prefix in routes.ts before this contract is mounted, so
 * `req.user` is always present. `getUserId()` throws when it is not (safety
 * guard only — should never fire in production).
 */

import { notebookCollectionsContract, type WolkeFolderRef } from '@gruenerator/contracts';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantDocumentService } from '../../services/document-services/DocumentSearchService/index.js';
import {
  getLikeCountsForEntities,
  getLikedEntityIdsForUser,
  likeEntity,
  unlikeEntity,
} from '../../services/entityLikes/EntityLikesService.js';
import { createNotification } from '../../services/notifications/NotificationService.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { fromParam, type DocumentId, type NotebookId } from '../../utils/types/branded.js';

import {
  checkNotebookAccess,
  requireNotebookEdit,
  requireNotebookOwner,
  requireNotebookRead,
} from './notebookAccess.js';

import type { DocumentRecord, WolkeShareLink } from './types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('notebookCollectionsContractRouter');
const notebookHelper = new NotebookQdrantHelper();

/**
 * Extract the authenticated user id.
 * The requireAuth middleware in routes.ts ensures req.user is set before
 * this router is reached — this function is a safety guard only.
 */
function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    log.error(
      '[notebookCollectionsContract] getUserId called with undefined req.user — middleware bypassed? url=%s',
      req.originalUrl
    );
    throw new Error('Authentication required');
  }
  return user.id;
}

/**
 * Resolve the calling user's locale for audience-filter decisions.
 * Falls back to 'de-DE' when the column is unset (matches the database
 * default in apps/api/database/schema/core.ts).
 */
function getUserLocale(req: Request): 'de-DE' | 'de-AT' {
  const user = req.user as UserProfile | undefined;
  return user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
}

// ── Helpers copied from collectionsController ──────────────────────────────

async function resolveWolkeLinksToDocuments(
  userId: string,
  wolkeShareLinkIds: string[]
): Promise<DocumentRecord[]> {
  if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
    return [];
  }
  const postgres = getPostgresInstance();
  try {
    const documents = await postgres.query<DocumentRecord>(
      `
      SELECT id, title, page_count, created_at, source_type, wolke_share_link_id
      FROM documents
      WHERE user_id = $1
      AND source_type = 'wolke'
      AND wolke_share_link_id = ANY($2)
      AND status = 'completed'
      ORDER BY created_at DESC
      `,
      [userId, wolkeShareLinkIds]
    );
    log.debug(
      `[notebookCollectionsContract] Resolved ${wolkeShareLinkIds.length} Wolke links to ${documents.length} documents`
    );
    return documents;
  } catch (error) {
    log.error('[notebookCollectionsContract] Error resolving Wolke links:', error);
    throw new Error('Failed to resolve Wolke links to documents');
  }
}

async function validateWolkeShareLinks(
  _userId: string,
  wolkeShareLinkIds: string[]
): Promise<boolean> {
  if (!wolkeShareLinkIds || !Array.isArray(wolkeShareLinkIds) || wolkeShareLinkIds.length === 0) {
    return true;
  }
  // Validation logic is currently a pass-through (mirrors collectionsController).
  return true;
}

/**
 * Shape of a notebook collection as it comes back from Qdrant before
 * enrichment. Matches the inline type previously duplicated inside
 * listCollections + getCollection handlers.
 */
type NotebookCollectionFromQdrantRaw = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  custom_prompt: string | null;
  selection_mode?: string | undefined;
  wolke_share_link_ids?: string[] | null | undefined;
  auto_sync?: boolean | undefined;
  remove_missing_on_sync?: boolean | undefined;
  created_at: string;
  updated_at: string;
  settings?: Record<string, unknown> | undefined;
  notebook_collection_documents?: Array<{ document_id: string }>;
  is_public?: boolean;
  public_ownership?: 'owner' | 'public_data' | null;
  share_mode?: 'private' | 'groups' | 'authenticated';
  edit_policy?: 'owner_only' | 'group_admins' | 'all_members';
  audience?: 'de-DE' | 'de-AT';
};

/**
 * Enrich a raw Qdrant notebook collection with the derived fields the API
 * contract response expects (documents, wolke_share_links, labels parsed
 * out of settings, etc.). Caller picks `accessSource` based on how the
 * viewer reached the collection.
 *
 * Used by both listCollections (per-entry) and getCollection (one entry).
 */
async function enrichNotebookCollection(
  collection: NotebookCollectionFromQdrantRaw,
  accessSource: 'owned' | 'shared' | 'authenticated'
) {
  const postgres = getPostgresInstance();
  const documentIds = (collection.notebook_collection_documents || []).map(
    (qcd) => qcd.document_id
  );

  let documents: DocumentRecord[] = [];
  if (documentIds.length > 0) {
    documents = await postgres.query<DocumentRecord>(
      'SELECT id, title, page_count, created_at, source_type, wolke_share_link_id FROM documents WHERE id = ANY($1)',
      [documentIds]
    );
  }

  let wolke_share_links: WolkeShareLink[] = [];
  if (collection.wolke_share_link_ids) {
    try {
      wolke_share_links = collection.wolke_share_link_ids.map((id) => ({ id }));
    } catch (error) {
      log.error('[notebookCollectionsContract] Error fetching Wolke share links:', error);
    }
  }

  const settings = (collection.settings as Record<string, unknown>) || {};
  const labels = Array.isArray(settings.labels) ? (settings.labels as string[]) : [];
  const wolke_folders = Array.isArray(settings.wolke_folders)
    ? (settings.wolke_folders as WolkeFolderRef[])
    : [];

  return {
    ...collection,
    documents,
    document_count: documents.length,
    selection_mode: collection.selection_mode || 'documents',
    wolke_share_links,
    has_wolke_sources: wolke_share_links.length > 0,
    documents_from_wolke: documents.filter((doc) => doc.source_type === 'wolke').length,
    auto_sync: !!collection.auto_sync,
    remove_missing_on_sync: !!collection.remove_missing_on_sync,
    labels,
    wolke_folders,
    is_public: collection.is_public === true,
    public_ownership: collection.public_ownership ?? null,
    access_source: accessSource,
  };
}

// ── Contract router ────────────────────────────────────────────────────────

const s = initServer();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const notebookCollectionsContractRouter = s.router(notebookCollectionsContract, {
  resolveCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const input = args.params.slugOrId;

      // UUID branch: legacy URL or direct ID — look up by canonical id.
      // Slug branch: pretty URL, dig the 6-char tail out and resolve via the
      // payload index. If neither matches, the user typed a system-notebook
      // slug or pure noise; let the frontend resolver handle the not-found UI.
      let collectionId: string | null = null;
      if (UUID_RE.test(input)) {
        collectionId = input;
      } else {
        const suffix = extractSlugSuffix(input);
        if (suffix) {
          const bySlug = await notebookHelper.getNotebookCollectionBySlugSuffix(suffix);
          collectionId = bySlug?.id ?? null;
        }
      }

      if (!collectionId) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }

      const access = await checkNotebookAccess(collectionId, userId);
      if (!access.exists) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (!access.canRead) {
        return { status: 403 as const, body: { error: 'Keine Berechtigung' } };
      }

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }

      return {
        status: 200 as const,
        body: {
          id: collection.id,
          slug_suffix: collection.slug_suffix ?? '',
          name: collection.name,
          share_mode: collection.share_mode ?? null,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.resolveCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  listCollections: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();

      const owned = (await notebookHelper.getUserNotebookCollections(
        userId
      )) as NotebookCollectionFromQdrantRaw[];
      const ownedIds = new Set(owned.map((c) => c.id));

      // Notebooks shared with any group the user belongs to.
      const groupSharedIdRows = (await postgres.query(
        `SELECT DISTINCT gcs.content_id
           FROM group_content_shares gcs
           INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
           WHERE gcs.content_type = 'notebook_collections' AND gm.user_id = $1`,
        [userId]
      )) as Array<{ content_id: string }>;
      const groupSharedIds = groupSharedIdRows
        .map((r) => r.content_id)
        .filter((id) => !ownedIds.has(id));
      const groupShared = (
        groupSharedIds.length > 0
          ? ((await notebookHelper.getNotebookCollectionsByIds(
              groupSharedIds
            )) as NotebookCollectionFromQdrantRaw[])
          : []
      ).filter((c) => c.share_mode === 'groups');
      const groupSharedIdsSet = new Set(groupShared.map((c) => c.id));

      // Notebooks visible to any authenticated user — excluding ones we
      // already have AND respecting the audience filter so an AT viewer
      // doesn't get a DE-targeted notebook (and vice versa). Legacy 'all'
      // rows are rewritten to the owner's locale at boot via
      // `backfillNotebookAudience`, so an exact match is all we need.
      const viewerLocale = getUserLocale(args.req);
      const authShared = (
        (await notebookHelper.getNotebookCollectionsByShareMode(
          'authenticated'
        )) as NotebookCollectionFromQdrantRaw[]
      ).filter(
        (c) => !ownedIds.has(c.id) && !groupSharedIdsSet.has(c.id) && c.audience === viewerLocale
      );

      const tagged: Array<{
        collection: NotebookCollectionFromQdrantRaw;
        access_source: 'owned' | 'shared' | 'authenticated';
      }> = [
        ...owned.map((c) => ({ collection: c, access_source: 'owned' as const })),
        ...groupShared.map((c) => ({ collection: c, access_source: 'shared' as const })),
        ...authShared.map((c) => ({ collection: c, access_source: 'authenticated' as const })),
      ];

      const transformedData = await Promise.all(
        tagged.map(({ collection, access_source }) =>
          enrichNotebookCollection(collection, access_source)
        )
      );

      const totalWolkeFolders = transformedData.reduce((acc, c) => acc + c.wolke_folders.length, 0);
      log.debug(
        `[listCollections] returning ${transformedData.length} collection(s) ` +
          `(owned=${owned.length} shared=${groupShared.length} authenticated=${authShared.length}), ` +
          `${totalWolkeFolders} wolke_folders total`
      );

      return {
        status: 200 as const,
        body: { success: true, collections: transformedData },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.listCollections] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  listPublicCollections: async (args) => {
    try {
      type NotebookCollectionFromQdrantRaw = {
        id: string;
        user_id: string;
        name: string;
        description: string | null;
        custom_prompt: string | null;
        selection_mode?: string | undefined;
        wolke_share_link_ids?: string[] | null | undefined;
        auto_sync?: boolean | undefined;
        remove_missing_on_sync?: boolean | undefined;
        created_at: string;
        updated_at: string;
        settings?: Record<string, unknown> | undefined;
        notebook_collection_documents?: Array<{ document_id: string }>;
        is_public?: boolean;
        public_ownership?: 'owner' | 'public_data' | null;
        audience?: 'de-DE' | 'de-AT';
      };

      const postgres = getPostgresInstance();
      // Audience-filter the public listing so a DE-targeted notebook never
      // surfaces in an AT viewer's "Von der Basis" (and vice versa) — same
      // exact-match rule the authenticated-share listing uses above.
      const viewerLocale = getUserLocale(args.req);
      const collections = (
        (await notebookHelper.getPublicNotebookCollections()) as NotebookCollectionFromQdrantRaw[]
      ).filter((c) => c.audience === viewerLocale);

      const likeCounts = await getLikeCountsForEntities(
        'notebook',
        collections.map((c) => c.id)
      );

      const userIds = Array.from(new Set(collections.map((c) => c.user_id)));
      const profileRows = userIds.length
        ? await postgres.query<{
            id: string;
            display_name: string | null;
            email: string | null;
          }>('SELECT id::text AS id, display_name, email FROM profiles WHERE id::text = ANY($1)', [
            userIds,
          ])
        : [];
      const nameByUserId = new Map(
        profileRows.map((p) => [p.id, p.display_name ?? p.email?.split('@')[0] ?? null] as const)
      );

      const transformedData = await Promise.all(
        collections.map(async (collection) => {
          const documentIds = (collection.notebook_collection_documents || []).map(
            (qcd) => qcd.document_id
          );

          let documents: DocumentRecord[] = [];
          if (documentIds.length > 0) {
            documents = await postgres.query<DocumentRecord>(
              'SELECT id, title, page_count, created_at, source_type, wolke_share_link_id FROM documents WHERE id = ANY($1)',
              [documentIds]
            );
          }

          const settings = (collection.settings as Record<string, unknown>) || {};
          const labels = Array.isArray(settings.labels) ? (settings.labels as string[]) : [];
          const wolke_folders = Array.isArray(settings.wolke_folders)
            ? (settings.wolke_folders as WolkeFolderRef[])
            : [];

          return {
            ...collection,
            documents,
            document_count: documents.length,
            selection_mode: collection.selection_mode || 'documents',
            wolke_share_links: [] as WolkeShareLink[],
            has_wolke_sources: false,
            documents_from_wolke: 0,
            auto_sync: !!collection.auto_sync,
            remove_missing_on_sync: !!collection.remove_missing_on_sync,
            labels,
            wolke_folders,
            is_public: collection.is_public === true,
            public_ownership: collection.public_ownership ?? null,
            likes_count: likeCounts.get(collection.id) ?? 0,
            creator_name: nameByUserId.get(collection.user_id) ?? null,
          };
        })
      );

      return {
        status: 200 as const,
        body: { success: true, collections: transformedData },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.listPublicCollections] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  createCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();

      const {
        name,
        description,
        custom_prompt,
        selection_mode: selectionModeRaw,
        document_ids: documentIdsRaw,
        wolke_share_link_ids: wolkeLinkIdsRaw,
        auto_sync,
        remove_missing_on_sync,
        labels,
        is_public,
        public_ownership,
        wolke_folders: wolkeFoldersRaw,
        audience: audienceRaw,
      } = args.body;
      // Default audience to the creator's locale so an Austrian user creating
      // a notebook ships AT-targeted by default. Caller can override via the
      // share modal (PUT /share/audience) or by sending an explicit value.
      const audience = audienceRaw ?? getUserLocale(args.req);

      const selection_mode = selectionModeRaw ?? 'documents';
      const document_ids = documentIdsRaw ?? [];
      const wolke_share_link_ids = wolkeLinkIdsRaw ?? [];
      const wolke_folders = Array.isArray(wolkeFoldersRaw) ? wolkeFoldersRaw : [];
      log.debug(
        `[createCollection] incoming wolke_folders raw=${typeof wolkeFoldersRaw} array=${Array.isArray(wolkeFoldersRaw)} count=${wolke_folders.length}`
      );

      if (!name || !name.trim()) {
        return { status: 400 as const, body: { error: 'Name is required' } };
      }

      if (Array.isArray(document_ids) && document_ids.length > 100) {
        return {
          status: 400 as const,
          body: { error: 'A notebook can contain at most 100 documents' },
        };
      }

      if (is_public === true && !public_ownership) {
        return {
          status: 400 as const,
          body: {
            error: 'public_ownership is required when is_public is true (owner | public_data)',
          },
        };
      }

      let allDocumentIds: string[] = [];
      let wolkeDocuments: DocumentRecord[] = [];

      if (selection_mode === 'wolke') {
        if (wolke_share_link_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one Wolke share link must be selected' },
          };
        }

        const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
        if (!hasAccess) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more Wolke share links' },
          };
        }

        wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
        allDocumentIds = wolkeDocuments.map((doc) => doc.id);

        if (allDocumentIds.length === 0) {
          return {
            status: 400 as const,
            body: {
              error:
                'No documents found in the selected Wolke folders. Please sync the folders first.',
            },
          };
        }
      } else {
        if (document_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one document must be selected' },
          };
        }

        const userDocuments = (await postgres.query(
          'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
          [userId, document_ids]
        )) as Array<{ id: string }>;

        if (userDocuments.length !== document_ids.length) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more documents' },
          };
        }

        allDocumentIds = document_ids;
      }

      const collectionData = {
        user_id: userId,
        name: name.trim(),
        description: description?.trim() ?? null,
        custom_prompt: custom_prompt?.trim() ?? null,
        selection_mode,
        document_count: allDocumentIds.length,
        wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
        auto_sync: selection_mode === 'wolke' ? !!(auto_sync ?? false) : false,
        remove_missing_on_sync:
          selection_mode === 'wolke' ? !!(remove_missing_on_sync ?? false) : false,
        settings: {
          ...(Array.isArray(labels) ? { labels: labels.map((l) => l.trim()).filter(Boolean) } : {}),
          wolke_folders,
        },
        is_public: is_public === true,
        public_ownership: is_public === true ? (public_ownership ?? null) : null,
        audience,
      };

      const result = await notebookHelper.storeNotebookCollection(collectionData);
      const collectionId = result.collection_id;

      try {
        await notebookHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);
      } catch (docError) {
        log.error(
          '[notebookCollectionsContract.createCollection] Error adding documents:',
          docError
        );
        await notebookHelper.deleteNotebookCollection(collectionId);
        return { status: 500 as const, body: { error: 'Failed to add documents to collection' } };
      }

      return {
        status: 201 as const,
        body: {
          success: true,
          collection: {
            id: collectionId,
            ...collectionData,
            document_count: allDocumentIds.length,
            documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
            wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : [],
            created_at: new Date().toISOString(),
          },
          message: `Notebook collection created successfully with ${allDocumentIds.length} document(s)`,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.createCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  updateCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const postgres = getPostgresInstance();
      const collectionId = fromParam<NotebookId>(args.params.id);

      const {
        name,
        description,
        custom_prompt,
        selection_mode: selectionModeRaw,
        document_ids: documentIdsRaw,
        wolke_share_link_ids: wolkeLinkIdsRaw,
        auto_sync,
        remove_missing_on_sync,
        labels,
        is_public,
        public_ownership,
        wolke_folders: wolkeFoldersRaw,
      } = args.body;

      const selection_mode = selectionModeRaw ?? 'documents';
      // Distinguish a metadata-only edit (document_ids omitted) from an explicit
      // document-set replace (document_ids provided as an array). undefined/null
      // means "leave the existing documents untouched" — see replaceDocuments below.
      const documentsProvided = documentIdsRaw != null;
      const document_ids = documentIdsRaw ?? [];
      const wolke_share_link_ids = wolkeLinkIdsRaw ?? [];

      if (!name || !name.trim()) {
        return { status: 400 as const, body: { error: 'Name is required' } };
      }

      if (Array.isArray(document_ids) && document_ids.length > 100) {
        return {
          status: 400 as const,
          body: { error: 'A notebook can contain at most 100 documents' },
        };
      }

      if (is_public === true && !public_ownership) {
        return {
          status: 400 as const,
          body: {
            error: 'public_ownership is required when is_public is true (owner | public_data)',
          },
        };
      }

      const guard = await requireNotebookEdit(collectionId, userId);
      if (guard) return guard;

      const existingCollection = await notebookHelper.getNotebookCollection(collectionId);
      if (!existingCollection) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      const isOwner = existingCollection.user_id === userId;

      let allDocumentIds: string[] = [];
      let wolkeDocuments: DocumentRecord[] = [];

      if (selection_mode === 'wolke') {
        if (wolke_share_link_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one Wolke share link must be selected' },
          };
        }

        const hasAccess = await validateWolkeShareLinks(userId, wolke_share_link_ids);
        if (!hasAccess) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more Wolke share links' },
          };
        }

        wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolke_share_link_ids);
        allDocumentIds = wolkeDocuments.map((doc) => doc.id);

        if (allDocumentIds.length === 0) {
          return {
            status: 400 as const,
            body: {
              error:
                'No documents found in the selected Wolke folders. Please sync the folders first.',
            },
          };
        }
      } else if (documentsProvided) {
        if (document_ids.length === 0) {
          return {
            status: 400 as const,
            body: { error: 'At least one document must be selected' },
          };
        }

        const userDocuments = (await postgres.query(
          'SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)',
          [userId, document_ids]
        )) as Array<{ id: string }>;

        if (userDocuments.length !== document_ids.length) {
          return {
            status: 403 as const,
            body: { error: 'Access denied to one or more documents' },
          };
        }

        allDocumentIds = document_ids;
      }

      // Replace document membership only when the caller resolved a concrete set:
      // a Wolke sync, or a documents-mode edit that explicitly sent document_ids.
      // A metadata-only edit (rename, description) leaves the existing docs intact.
      const replaceDocuments = selection_mode === 'wolke' || documentsProvided;

      const updateData: Record<string, unknown> = {
        name: name.trim(),
        description: description?.trim() ?? null,
        custom_prompt: custom_prompt?.trim() ?? null,
        selection_mode,
        wolke_share_link_ids: selection_mode === 'wolke' ? wolke_share_link_ids : null,
      };
      if (replaceDocuments) {
        updateData.document_count = allDocumentIds.length;
      }

      const existingSettings = (existingCollection.settings as Record<string, unknown>) || {};
      const existingWolkeFoldersCount = Array.isArray(existingSettings.wolke_folders)
        ? (existingSettings.wolke_folders as unknown[]).length
        : 0;
      const settingsPatch: Record<string, unknown> = { ...existingSettings };
      let settingsChanged = false;
      if (Array.isArray(labels)) {
        settingsPatch.labels = labels.map((l) => l.trim()).filter(Boolean);
        settingsChanged = true;
      }
      if (Array.isArray(wolkeFoldersRaw)) {
        settingsPatch.wolke_folders = wolkeFoldersRaw;
        settingsChanged = true;
      }
      if (settingsChanged) {
        updateData.settings = settingsPatch;
      }
      log.debug(
        `[updateCollection ${collectionId}] incoming wolke_folders raw=${typeof wolkeFoldersRaw} array=${Array.isArray(wolkeFoldersRaw)} count=${Array.isArray(wolkeFoldersRaw) ? wolkeFoldersRaw.length : 0} existing=${existingWolkeFoldersCount} settingsChanged=${settingsChanged}`
      );

      if (selection_mode === 'wolke') {
        if (typeof auto_sync === 'boolean') updateData.auto_sync = auto_sync;
        if (typeof remove_missing_on_sync === 'boolean')
          updateData.remove_missing_on_sync = remove_missing_on_sync;
      } else {
        // wolke_folders model: auto_sync is the hourly-watch toggle, set via the
        // dedicated /auto-sync endpoint. Only honour an explicit value here and
        // otherwise leave it untouched — don't clobber the watch flag on an
        // unrelated edit (rename, label change, etc.).
        if (typeof auto_sync === 'boolean') updateData.auto_sync = auto_sync;
        updateData.remove_missing_on_sync = false;
      }

      if (isOwner && typeof is_public === 'boolean') {
        updateData.is_public = is_public;
        updateData.public_ownership = is_public ? (public_ownership ?? null) : null;
      }

      await notebookHelper.updateNotebookCollection(collectionId, updateData);

      if (replaceDocuments) {
        const existingDocuments = await notebookHelper.getCollectionDocuments(collectionId);
        const existingDocIds = existingDocuments.map((doc) => doc.document_id);

        if (existingDocIds.length > 0) {
          await notebookHelper.removeDocumentsFromCollection(collectionId, existingDocIds);
        }

        await notebookHelper.addDocumentsToCollection(collectionId, allDocumentIds, userId);
      }

      return {
        status: 200 as const,
        body: {
          success: true,
          message: replaceDocuments
            ? `Notebook collection updated successfully with ${allDocumentIds.length} document(s)`
            : 'Notebook collection updated successfully',
          documents_from_wolke: selection_mode === 'wolke' ? wolkeDocuments.length : 0,
          wolke_share_links: selection_mode === 'wolke' ? wolke_share_link_ids : [],
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.updateCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  syncCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const guard = await requireNotebookEdit(collectionId, userId);
      if (guard) return guard;

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      if ((collection.selection_mode || 'documents') !== 'wolke') {
        return {
          status: 400 as const,
          body: { error: 'Sync is only available for Wolke-based collections' },
        };
      }

      const wolkeLinkIds = (collection.wolke_share_link_ids as string[] | null) || [];
      if (!Array.isArray(wolkeLinkIds) || wolkeLinkIds.length === 0) {
        return {
          status: 400 as const,
          body: { error: 'No Wolke share links configured for this collection' },
        };
      }

      const hasAccess = await validateWolkeShareLinks(userId, wolkeLinkIds);
      if (!hasAccess) {
        return {
          status: 403 as const,
          body: { error: 'Access denied to one or more Wolke share links' },
        };
      }

      const wolkeDocuments = await resolveWolkeLinksToDocuments(userId, wolkeLinkIds);
      const currentDocIds = new Set((wolkeDocuments || []).map((d) => d.id));

      const existing = await notebookHelper.getCollectionDocuments(collectionId);
      const existingIds = new Set((existing || []).map((ed) => ed.document_id));

      const docsToAdd = [...currentDocIds].filter((id) => !existingIds.has(id));
      const shouldRemove = !!(collection.remove_missing_on_sync as boolean | undefined);
      const docsToRemove = shouldRemove
        ? [...existingIds].filter((id) => !currentDocIds.has(id))
        : [];

      let addedCount = 0;
      if (docsToAdd.length > 0) {
        await notebookHelper.addDocumentsToCollection(collectionId, docsToAdd, userId);
        addedCount = docsToAdd.length;
      }

      let removedCount = 0;
      if (docsToRemove.length > 0) {
        await notebookHelper.removeDocumentsFromCollection(collectionId, docsToRemove);
        removedCount = docsToRemove.length;
      }

      // Recount from the join collection — arithmetic on the pre-sync snapshot
      // drifts when documents are added/removed concurrently.
      const newTotal = (await notebookHelper.getCollectionDocuments(collectionId)).length;
      await notebookHelper.updateNotebookCollection(collectionId, { document_count: newTotal });

      return {
        status: 200 as const,
        body: {
          success: true,
          message: `Collection synchronized. ${addedCount} added, ${removedCount} removed.`,
          added_count: addedCount,
          removed_count: removedCount,
          total_count: newTotal,
          wolke_share_links: wolkeLinkIds,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.syncCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  searchCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);
      const query = args.query.q.trim();

      if (!query) {
        return {
          status: 400 as const,
          body: { error: 'Query parameter "q" is required' },
        };
      }

      const guard = await requireNotebookRead(collectionId, userId);
      if (guard) return guard;

      const collectionDocs = await notebookHelper.getCollectionDocuments(collectionId);
      const documentIds = collectionDocs.map((d) => d.document_id);

      if (documentIds.length === 0) {
        return { status: 200 as const, body: [] };
      }

      const documentSearchService = getQdrantDocumentService();
      const response = await documentSearchService.search({
        query,
        userId,
        options: { limit: 8, mode: 'hybrid', threshold: 0.2 },
        filters: { documentIds },
      });

      const results = (response.results || []).slice(0, 8).map((r) => ({
        documentId: r.document_id,
        title: r.title || r.source_url || 'Unbekannt',
        excerpt: (r.relevant_content || '').slice(0, 200),
        score: r.similarity_score ?? 0,
      }));

      return { status: 200 as const, body: results };
    } catch (error) {
      log.error('[notebookCollectionsContract.searchCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Search failed' } };
    }
  },

  // Registered before deleteCollection so the literal `/bulk` segment wins
  // over the `/:id` matcher (ts-rest registers routes in object order).
  bulkDelete: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { ids } = args.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return {
          status: 400 as const,
          body: { error: 'Array of collection IDs is required' },
        };
      }

      if (ids.length > 100) {
        return {
          status: 400 as const,
          body: { error: 'Maximum 100 collections can be deleted at once' },
        };
      }

      const result = await notebookHelper.bulkDeleteCollections(ids, userId);

      const deletedIds = result.results.deleted;
      const failedIds = result.results.failed.map((f: { id: string }) => f.id);

      return {
        status: 200 as const,
        body: {
          success: true,
          message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} Notebook collections deleted successfully`,
          deleted_count: deletedIds.length,
          failed_ids: failedIds,
          total_requested: ids.length,
          deleted_ids: deletedIds,
        },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.bulkDelete] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: {
          error: err.message || 'Failed to perform bulk delete of Notebook collections',
        },
      };
    }
  },

  deleteCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const guard = await requireNotebookOwner(collectionId, userId);
      if (guard) return guard;

      await notebookHelper.deleteNotebookCollection(collectionId);

      return {
        status: 200 as const,
        body: { success: true, message: 'Notebook collection deleted successfully' },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.deleteCollection] Error:', error);
      return {
        status: 500 as const,
        body: { error: 'Failed to delete Notebook collection' },
      };
    }
  },

  removeDocument: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);
      const documentId = fromParam<DocumentId>(args.params.documentId);

      const guard = await requireNotebookEdit(collectionId, userId);
      if (guard) return guard;

      await notebookHelper.removeDocumentsFromCollection(collectionId, [documentId]);

      const remaining = (await notebookHelper.getCollectionDocuments(collectionId)).length;
      await notebookHelper.updateNotebookCollection(collectionId, { document_count: remaining });

      log.debug(
        `[notebookCollectionsContract] Removed document ${documentId} from collection ${collectionId}`
      );

      return {
        status: 200 as const,
        body: { success: true, message: 'Document removed from collection' },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.removeDocument] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  listMyLikedCollections: async (args) => {
    try {
      const userId = getUserId(args.req);
      const liked_ids = await getLikedEntityIdsForUser({ userId, entityType: 'notebook' });
      return {
        status: 200 as const,
        body: { success: true, liked_ids },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.listMyLikedCollections] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  likeCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.is_public !== true) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      const result = await likeEntity({ userId, entityType: 'notebook', entityId: collectionId });

      if (result.createdNew && collection.user_id && collection.user_id !== userId) {
        const profile = await getProfileService().getProfileById(userId);
        const likerName = profile?.display_name?.trim() || 'Jemand';
        createNotification({
          userId: collection.user_id,
          type: 'notebook_liked',
          title: `${likerName} mag dein Notizbuch`,
          body: collection.name ?? null,
          metadata: {
            notebookId: collectionId,
            notebookTitle: collection.name,
            likerId: userId,
            likerName,
          },
          actionUrl: `/notebook/${collectionId}`,
          groupKey: `notebook:${collectionId}:liked`,
        }).catch((err) => {
          log.warn('[notebookCollectionsContract.likeCollection] notification failed', err);
        });
      }

      return {
        status: 200 as const,
        body: { success: true, liked: true, count: result.count },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.likeCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  unlikeCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = fromParam<NotebookId>(args.params.id);

      const collection = await notebookHelper.getNotebookCollection(collectionId);
      if (!collection || collection.is_public !== true) {
        return { status: 404 as const, body: { error: 'Notebook collection not found' } };
      }

      const result = await unlikeEntity({ userId, entityType: 'notebook', entityId: collectionId });

      return {
        status: 200 as const,
        body: { success: true, liked: false, count: result.count },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.unlikeCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  getCollection: async (args) => {
    try {
      const userId = getUserId(args.req);
      const input = args.params.slugOrId;

      let collectionId: string | null = null;
      if (UUID_RE.test(input)) {
        collectionId = input;
      } else {
        const suffix = extractSlugSuffix(input);
        if (suffix) {
          const bySlug = await notebookHelper.getNotebookCollectionBySlugSuffix(suffix);
          collectionId = bySlug?.id ?? null;
        }
      }

      if (!collectionId) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }

      const access = await checkNotebookAccess(collectionId, userId);
      if (!access.exists) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }
      if (!access.canRead) {
        return { status: 403 as const, body: { error: 'Keine Berechtigung' } };
      }

      const collection = (await notebookHelper.getNotebookCollection(
        collectionId
      )) as NotebookCollectionFromQdrantRaw | null;
      if (!collection) {
        return { status: 404 as const, body: { error: 'Notebook nicht gefunden' } };
      }

      const accessSource: 'owned' | 'shared' | 'authenticated' = access.isOwner
        ? 'owned'
        : collection.share_mode === 'groups'
          ? 'shared'
          : 'authenticated';

      const enriched = await enrichNotebookCollection(collection, accessSource);

      return {
        status: 200 as const,
        body: { success: true, collection: enriched },
      };
    } catch (error) {
      log.error('[notebookCollectionsContract.getCollection] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },
});

/**
 * Mount the ts-rest notebook collections contract router onto an Express app.
 * Call this from routes.ts BEFORE mounting the legacy collectionsController router.
 *
 * `requireAuth` middleware MUST be applied at the path prefix in routes.ts
 * before calling this function — all 10 routes require authentication.
 */
export function mountNotebookCollectionsContractRouter(app: Application): void {
  createExpressEndpoints(notebookCollectionsContract, notebookCollectionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'notebookCollectionsContract'),
  });
}
