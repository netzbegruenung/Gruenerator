/**
 * Group content sharing routes
 * Handles content sharing, permissions, and group content retrieval
 */

import fs from 'fs';
import path from 'path';

import express, { type Router, type Response } from 'express';

import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import { getPostgresAndCheckMembership } from './groupCore.js';

import type {
  AuthRequest,
  GroupContentShareBody,
  GroupContentUnshareBody,
  GroupContentPermissionsBody,
  GroupContentDeleteBody,
} from '../types.js';

const log = createLogger('groupContent');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

interface ShareRecord {
  content_type: string;
  content_id: string;
  shared_at: string;
  permissions: string | Record<string, unknown>;
  shared_by_user_id: string;
  first_name: string | null;
  display_name: string | null;
}

interface ContentItem {
  id: string;
  [key: string]: unknown;
}

interface SystemTemplate {
  id: string;
  title: string;
  description: string;
  template_type: string;
  thumbnail_url: string;
  preview_image?: string;
  external_url: string;
  tags: string[];
  categories: string[];
}

let systemTemplates: SystemTemplate[] = [];
try {
  const apiRoot = process.cwd();
  const systemTemplatesPath = path.resolve(apiRoot, 'config/templates/system-templates.json');
  const data = fs.readFileSync(systemTemplatesPath, 'utf-8');
  const parsed = JSON.parse(data) as {
    templates?: Array<SystemTemplate & { preview_image?: string }>;
  };
  systemTemplates = (parsed.templates ?? []).map(
    (t: SystemTemplate & { preview_image?: string }) => ({
      ...t,
      thumbnail_url: t.preview_image
        ? `/auth/template-previews/${t.preview_image}`
        : t.thumbnail_url,
    })
  );
} catch {
  log.warn('[Group Content] Could not load system templates for vorlagen matching');
}

// ============================================================================
// Group Vorlagen (tag-based template matching)
// ============================================================================

router.get(
  '/groups/:groupId/vorlagen',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Read group settings for templateTags
      const group = await postgres.queryOne(
        'SELECT settings FROM groups WHERE id = $1',
        [groupId],
        { table: 'groups' }
      );

      const settings =
        typeof group?.settings === 'string'
          ? (JSON.parse(group.settings) as { templateTags?: string[] })
          : ((group?.settings as { templateTags?: string[] } | null) ?? {});
      const templateTags: string[] = settings.templateTags ?? [];

      if (templateTags.length === 0) {
        res.json({ success: true, vorlagen: [], tags: [] });
        return;
      }

      // Query published user templates where tags overlap with group tags
      // Using ?| operator: "does the JSONB array contain any of these values?"
      const dbTemplates = await postgres.query(
        `SELECT id, title, description, template_type, thumbnail_url, external_url,
                tags, categories, metadata, created_at
         FROM user_templates
         WHERE is_private = false
           AND status = 'published'
           AND type = 'template'
           AND tags ?| $1::text[]
         ORDER BY created_at DESC`,
        [templateTags],
        { table: 'user_templates' }
      );

      // Filter system templates that match any of the group tags
      const lowerTags = templateTags.map((t: string) => t.toLowerCase());
      const matchingSystemTemplates = systemTemplates
        .filter((t) => {
          const tTags = (t.tags || []).map((tag: string) => tag.toLowerCase());
          const tCategories = (t.categories || []).map((c: string) => c.toLowerCase());
          const tType = (t.template_type || '').toLowerCase();
          return lowerTags.some(
            (groupTag) =>
              tTags.includes(groupTag) || tCategories.includes(groupTag) || tType === groupTag
          );
        })
        .map((t) => ({
          ...t,
          is_system: true,
        }));

      // Combine and deduplicate by id
      const seenIds = new Set<string>();
      const allVorlagen: Array<{
        id: string;
        title: string;
        description: string;
        template_type: string;
        thumbnail_url: string;
        external_url: string;
        is_system: boolean;
        tags?: string[];
        categories?: string[];
        created_at?: unknown;
      }> = [];

      for (const t of [
        ...((dbTemplates || []) as Array<Record<string, unknown> & SystemTemplate>),
        ...matchingSystemTemplates,
      ]) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          allVorlagen.push({
            id: t.id,
            title: t.title,
            description: t.description,
            template_type: t.template_type,
            thumbnail_url: t.thumbnail_url,
            external_url: t.external_url,
            tags: t.tags || [],
            categories: ((t as Record<string, unknown>).categories as string[]) || [],
            is_system: !!t.is_system,
            created_at: 'created_at' in t ? t.created_at : undefined,
          });
        }
      }

      res.json({
        success: true,
        vorlagen: allVorlagen,
        tags: templateTags,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[Group Vorlagen] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Vorlagen.',
      });
    }
  }
);

const VALID_CONTENT_TYPES = new Set([
  'documents',
  'custom_generators',
  'notebook_collections',
  'user_documents',
  'database',
  'collaborative_documents',
  'system_notebooks',
]);

const tableNameMap: Record<string, string> = {
  database: 'user_templates',
  template: 'user_templates',
  user_templates: 'user_templates',
  instructions: 'user_instructions',
  user_instructions: 'user_instructions',
};

// ============================================================================
// Share Content Endpoints
// ============================================================================

// Share content to a group
router.post(
  '/groups/:groupId/share',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { contentType, contentId, permissions } = req.body as GroupContentShareBody;

      if (!groupId || !contentType || !contentId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.',
        });
        return;
      }

      if (!VALID_CONTENT_TYPES.has(contentType)) {
        res.status(400).json({
          success: false,
          message: 'Ungültiger Content-Type.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // System notebooks are globally available — skip ownership check
      if (contentType !== 'system_notebooks') {
        const tableName = tableNameMap[contentType] || contentType;
        const ownerColumn = contentType === 'collaborative_documents' ? 'created_by' : 'user_id';

        // Build ownership query based on content type
        let ownershipSQL = `SELECT ${ownerColumn} FROM ${tableName} WHERE id = $1`;
        const ownershipParams: Array<string> = [contentId];

        // For user_templates table (templates), also filter by type = 'template'
        if (tableName === 'user_templates') {
          ownershipSQL += ` AND type = $2`;
          ownershipParams.push('template');
        }

        // For collaborative_documents, also filter out deleted
        if (contentType === 'collaborative_documents') {
          ownershipSQL += ` AND is_deleted = false`;
        }

        const contentOwnership = await postgres.queryOne<{ [key: string]: string }>(
          ownershipSQL,
          ownershipParams,
          {
            table: tableName,
          }
        );

        if (!contentOwnership) {
          log.error(
            '[User Groups /groups/:groupId/share POST] Content ownership verification failed:',
            {
              contentType,
              contentId,
              userId,
            }
          );
          res.status(404).json({
            success: false,
            message: 'Inhalt nicht gefunden.',
          });
          return;
        }

        if (contentOwnership[ownerColumn] !== userId) {
          res.status(403).json({
            success: false,
            message: 'Du bist nicht Besitzer*in dieses Inhalts.',
          });
          return;
        }
      }

      const existingShare = await postgres.queryOne<{ id: string }>(
        'SELECT id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );

      if (existingShare) {
        res.status(400).json({
          success: false,
          message: 'Inhalt ist bereits mit dieser Gruppe geteilt.',
        });
        return;
      }

      const sharePermissions = permissions ?? {
        read: true,
        write: false,
        collaborative: false,
      };

      log.debug('[User Groups /share] Inserting share record:', {
        contentType,
        contentId,
        groupId,
        userId,
        permissions: sharePermissions,
      });

      await postgres.exec(
        'INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions) VALUES ($1, $2, $3, $4, $5)',
        [contentType, contentId, groupId, userId, JSON.stringify(sharePermissions)]
      );

      log.debug('[User Groups /share] Share record inserted successfully');

      const CONTENT_LABELS: Record<string, string> = {
        documents: 'ein Dokument',
        custom_generators: 'einen Grünerator',
        notebook_collections: 'ein Notizbuch',
        user_documents: 'einen Text',
        collaborative_documents: 'ein Dokument',
        database: 'einen Datenbank-Eintrag',
        system_notebooks: 'ein Notizbuch',
      };
      import('../../../services/notifications/index.js')
        .then(({ notifyGroupMembers }) => {
          const groupInfo = postgres.queryOne('SELECT name FROM groups WHERE id = $1', [groupId], {
            table: 'groups',
          });
          return groupInfo.then((g) =>
            notifyGroupMembers({
              groupId,
              excludeUserId: userId,
              type: 'group_content_shared',
              title: 'Neuer Inhalt',
              body: `${req.user?.display_name || 'Jemand'} hat ${CONTENT_LABELS[contentType] || 'etwas'} in „${g?.name || 'deiner Gruppe'}" geteilt`,
              actionUrl: `/gruppen/${groupId}`,
              metadata: { contentType, contentId },
            })
          );
        })
        .catch(() => {});

      res.json({
        success: true,
        message: 'Inhalt erfolgreich mit der Gruppe geteilt.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/share POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Teilen des Inhalts.',
      });
    }
  }
);

// Unshare content from a group
router.delete(
  '/groups/:groupId/share',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { contentType, contentId } = req.body as GroupContentUnshareBody;

      if (!groupId || !contentType || !contentId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Verify the share exists and user owns it or has permission to unshare
      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );

      if (!shareRecord) {
        res.status(404).json({
          success: false,
          message: 'Geteilter Inhalt nicht gefunden.',
        });
        return;
      }

      // Only the user who shared the content can unshare it (or group admins in future)
      if (shareRecord.shared_by_user_id !== userId) {
        res.status(403).json({
          success: false,
          message: 'Du kannst nur Inhalte aufheben, die du selbst geteilt hast.',
        });
        return;
      }

      // Remove from junction table
      const result = await postgres.exec(
        'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId]
      );

      if (result.changes === 0) {
        throw new Error('Share record not found or already deleted');
      }

      res.json({
        success: true,
        message: 'Inhalt wurde erfolgreich aus der Gruppe entfernt.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/share DELETE] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Entfernen des Inhalts aus der Gruppe.',
      });
    }
  }
);

// ============================================================================
// Get Group Content
// ============================================================================

// Get all content shared with a group
router.get(
  '/groups/:groupId/content',
  ensureAuthenticated,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Fetch shared content with user profile information
      const sharedContent: ShareRecord[] =
        ((await postgres.query(
          `
      SELECT
        gcs.content_type,
        gcs.content_id,
        gcs.shared_at,
        gcs.permissions,
        gcs.shared_by_user_id,
        p.first_name,
        p.display_name
      FROM group_content_shares gcs
      LEFT JOIN profiles p ON p.id = gcs.shared_by_user_id
      WHERE gcs.group_id = $1
      ORDER BY gcs.shared_at DESC
    `,
          [groupId],
          { table: 'group_content_shares' }
        )) as ShareRecord[]) || [];

      log.debug('[User Groups /content] Fetched shared content:', {
        groupId,
        totalShares: sharedContent.length,
        contentTypes: sharedContent.map((s: ShareRecord) => s.content_type),
      });

      // Group shared content by type for easier processing
      const contentByType: Record<string, ShareRecord[]> = {
        documents: [],
        custom_generators: [],
        notebook_collections: [],
        user_documents: [],
        database: [],
        collaborative_documents: [],
        system_notebooks: [],
      };

      sharedContent.forEach((share: ShareRecord) => {
        if (contentByType[share.content_type]) {
          contentByType[share.content_type].push(share);
        }
      });

      // Fetch actual content details for all types in parallel
      type ContentResult = {
        type: string;
        result: { data: Array<Record<string, unknown>> };
        shares: ShareRecord[];
      };
      const fetchPromises: Promise<ContentResult | null>[] = [];

      if (contentByType.documents.length > 0) {
        const ids = contentByType.documents.map((s: ShareRecord) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, filename, file_size, status, created_at, updated_at, user_id FROM documents WHERE id = ANY($1)',
              [ids],
              { table: 'documents' }
            )
            .then((data) => ({
              type: 'documents',
              result: { data: data || [] },
              shares: contentByType.documents,
            }))
        );
      }

      if (contentByType.custom_generators.length > 0) {
        const ids = contentByType.custom_generators.map((s: ShareRecord) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, name, title, description, created_at, updated_at, user_id FROM custom_generators WHERE id = ANY($1)',
              [ids],
              { table: 'custom_generators' }
            )
            .then((data) => ({
              type: 'custom_generators',
              result: { data: data || [] },
              shares: contentByType.custom_generators,
            }))
        );
      }

      if (contentByType.notebook_collections.length > 0) {
        const ids = contentByType.notebook_collections.map((s: ShareRecord) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, name, description, view_count, created_at, updated_at, user_id FROM notebook_collections WHERE id = ANY($1)',
              [ids],
              { table: 'notebook_collections' }
            )
            .then((data) => ({
              type: 'notebook_collections',
              result: { data: data || [] },
              shares: contentByType.notebook_collections,
            }))
        );
      }

      // System Notebooks (no DB lookup needed — frontend resolves display from config)
      if (contentByType.system_notebooks.length > 0) {
        const systemNotebooksData = contentByType.system_notebooks.map((s: ShareRecord) => ({
          id: s.content_id,
          system: true,
        }));
        fetchPromises.push(
          Promise.resolve({
            type: 'system_notebooks',
            result: { data: systemNotebooksData },
            shares: contentByType.system_notebooks,
          })
        );
      }

      if (contentByType.user_documents.length > 0) {
        const ids = contentByType.user_documents.map((s: ShareRecord) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, document_type, content, created_at, updated_at, user_id FROM user_documents WHERE id = ANY($1)',
              [ids],
              { table: 'user_documents' }
            )
            .then((rawData) => {
              const textsData = ((rawData || []) as Array<ContentItem & { content?: string }>).map(
                (item) => {
                  let plainText = item.content || '';
                  let prev = '';
                  while (prev !== plainText) {
                    prev = plainText;
                    plainText = plainText.replace(/<[^>]*>/g, '');
                  }
                  plainText = plainText.trim();
                  const wordCount = plainText
                    .split(/\s+/)
                    .filter((word: string) => word.length > 0).length;
                  return { ...item, word_count: wordCount, character_count: plainText.length };
                }
              );
              return {
                type: 'user_documents',
                result: { data: textsData },
                shares: contentByType.user_documents,
              };
            })
        );
      }

      if (contentByType.database.length > 0) {
        const ids = contentByType.database.map((s: ShareRecord) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              "SELECT id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id FROM user_templates WHERE id = ANY($1) AND type = 'template'",
              [ids],
              { table: 'user_templates' }
            )
            .then((data) => ({
              type: 'database',
              result: { data: data || [] },
              shares: contentByType.database,
            }))
        );
      }

      if (contentByType.collaborative_documents.length > 0) {
        const ids = contentByType.collaborative_documents.map((s: ShareRecord) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, document_subtype, created_by, created_at, updated_at FROM collaborative_documents WHERE id = ANY($1::uuid[]) AND is_deleted = false',
              [ids],
              { table: 'collaborative_documents' }
            )
            .then((data) => ({
              type: 'collaborative_documents',
              result: { data: data || [] },
              shares: contentByType.collaborative_documents,
            }))
        );
      }

      const contentResults = (await Promise.all(fetchPromises)).filter(Boolean) as ContentResult[];

      // Process and format results
      const groupContent: Record<string, unknown[]> = {
        documents: [],
        generators: [],
        notebooks: [],
        texts: [],
        templates: [],
        collaborative_documents: [],
        system_notebooks: [],
      };

      contentResults.forEach(({ type, result, shares }) => {
        const items = (result.data || []).map((item) => {
          // Find the corresponding share info
          const shareInfo = shares.find((s: ShareRecord) => s.content_id === item.id);

          const parsedPermissions: Record<string, unknown> =
            typeof shareInfo?.permissions === 'string'
              ? (JSON.parse(shareInfo.permissions) as Record<string, unknown>)
              : ((shareInfo?.permissions as Record<string, unknown> | null) ?? {});

          const parsedMetadata: Record<string, unknown> =
            type === 'database' && item.metadata != null
              ? typeof item.metadata === 'string'
                ? (JSON.parse(item.metadata) as Record<string, unknown>)
                : (item.metadata as Record<string, unknown>)
              : {};

          return {
            ...item,
            contentType: type,
            shared_at: shareInfo?.shared_at,
            group_permissions: parsedPermissions,
            shared_by_name: shareInfo?.display_name || shareInfo?.first_name || 'Unknown User',
            // Add template-specific fields for database
            ...(type === 'database' && {
              template_type: (parsedMetadata.template_type as string) || 'template',
              external_url: item.external_url,
            }),
          };
        });

        // Map to the correct groupContent key
        const keyMap: Record<string, string> = {
          documents: 'documents',
          custom_generators: 'generators',
          notebook_collections: 'notebooks',
          user_documents: 'texts',
          database: 'templates',
          collaborative_documents: 'collaborative_documents',
          system_notebooks: 'system_notebooks',
        };

        groupContent[keyMap[type]] = items;
      });

      log.debug('[User Groups /content] Final response:', {
        templatesCount: groupContent.templates.length,
        documentsCount: groupContent.documents.length,
        textsCount: groupContent.texts.length,
      });

      res.json({
        success: true,
        content: groupContent,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/content GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Gruppeninhalte.',
      });
    }
  }
);

// ============================================================================
// Content Permissions
// ============================================================================

// Update content permissions
router.put(
  '/groups/:groupId/content/:contentId/permissions',
  ensureAuthenticated,
  async (
    req: AuthRequest<{ groupId: string; contentId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const { groupId, contentId } = req.params;
      const userId = req.user!.id;
      const { contentType, permissions } = req.body as GroupContentPermissionsBody;

      if (!groupId || !contentId || !contentType || !permissions) {
        res.status(400).json({
          success: false,
          message: 'Alle Parameter sind erforderlich.',
        });
        return;
      }

      // Validate content type
      if (!VALID_CONTENT_TYPES.has(contentType)) {
        res.status(400).json({
          success: false,
          message: 'Ungültiger Content-Type.',
        });
        return;
      }

      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Check if content is shared with the group and get share info
      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );

      if (!shareRecord) {
        res.status(404).json({
          success: false,
          message: 'Inhalt ist nicht mit dieser Gruppe geteilt.',
        });
        return;
      }

      // Check if user has permission to modify permissions (admin or content sharer)
      const isAdmin = membership.role === 'admin';
      const isSharer = shareRecord.shared_by_user_id === userId;

      if (!isAdmin && !isSharer) {
        res.status(403).json({
          success: false,
          message: 'Keine Berechtigung zum Ändern der Berechtigungen.',
        });
        return;
      }

      // Update permissions in the junction table
      const result = await postgres.exec(
        'UPDATE group_content_shares SET permissions = $1 WHERE content_type = $2 AND content_id = $3 AND group_id = $4',
        [JSON.stringify(permissions), contentType, contentId, groupId]
      );

      if (result.changes === 0) {
        throw new Error('Share record not found or no changes made');
      }

      res.json({
        success: true,
        message: 'Berechtigungen erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/content/:contentId/permissions PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Berechtigungen.',
      });
    }
  }
);

// Remove content from group (unshare)
router.delete(
  '/groups/:groupId/content/:contentId',
  ensureAuthenticated,
  async (
    req: AuthRequest<{ groupId: string; contentId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const { groupId, contentId } = req.params;
      const userId = req.user!.id;
      const { contentType } = req.body as GroupContentDeleteBody;

      if (!groupId || !contentId || !contentType) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID, Content-ID und Content-Type sind erforderlich.',
        });
        return;
      }

      // Validate content type - include database for templates
      if (!VALID_CONTENT_TYPES.has(contentType)) {
        res.status(400).json({
          success: false,
          message: 'Ungültiger Content-Type.',
        });
        return;
      }

      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Check if user is admin
      const isAdmin = membership.role === 'admin';

      // For now, only admins can unshare content (can be extended later)
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          message: 'Nur Gruppenadministratoren können geteilte Inhalte entfernen.',
        });
        return;
      }

      // Verify the share exists in the junction table
      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );

      if (!shareRecord) {
        log.error('[User Groups /groups/:groupId/content/:contentId DELETE] Share check error');
        res.status(404).json({
          success: false,
          message: 'Geteilter Inhalt nicht gefunden.',
        });
        return;
      }

      // Remove from junction table
      const result = await postgres.exec(
        'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId]
      );

      if (result.changes === 0) {
        log.error('[User Groups /groups/:groupId/content/:contentId DELETE] Unshare error');
        throw new Error('Share record not found or already deleted');
      }

      res.json({
        success: true,
        message: 'Inhalt erfolgreich aus der Gruppe entfernt.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/content/:contentId DELETE] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Entfernen des geteilten Inhalts.',
      });
    }
  }
);

export default router;
