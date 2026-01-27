/**
 * Group content sharing routes
 * Handles content sharing, permissions, and group content retrieval
 */

import express, { type Router, type Response } from 'express';

import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import { getPostgresAndCheckMembership } from './groupCore.js';

import type { AuthRequest } from '../types.js';

const log = createLogger('groupContent');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// Valid content types for sharing
const validContentTypes = [
  'documents',
  'custom_generators',
  'notebook_collections',
  'user_documents',
  'database',
];

// Map content type to actual table name
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { contentType, contentId, permissions } = req.body;

      if (!groupId || !contentType || !contentId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.',
        });
        return;
      }

      // Validate content type
      if (!validContentTypes.includes(contentType)) {
        res.status(400).json({
          success: false,
          message: 'Ungültiger Content-Type.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Verify user owns the content
      const tableName = tableNameMap[contentType] || contentType;

      // Build ownership query based on content type
      let ownershipSQL = `SELECT user_id FROM ${tableName} WHERE id = $1`;
      const ownershipParams: any[] = [contentId];

      // For user_templates table (templates), also filter by type = 'template'
      if (tableName === 'user_templates') {
        ownershipSQL += ` AND type = $2`;
        ownershipParams.push('template');
      }

      const contentOwnership = await postgres.queryOne(ownershipSQL, ownershipParams, {
        table: tableName,
      });

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

      if (contentOwnership.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: 'Du bist nicht der Besitzer dieses Inhalts.',
        });
        return;
      }

      // Check if content is already shared with this group via junction table
      const existingShare = await postgres.queryOne(
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

      // Set default permissions if not provided
      const sharePermissions = permissions || {
        read: true,
        write: false,
        collaborative: false,
      };

      // Share content using junction table
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { contentType, contentId } = req.body;

      if (!groupId || !contentType || !contentId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID, Content-Type und Content-ID sind erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Verify the share exists and user owns it or has permission to unshare
      const shareRecord = await postgres.queryOne(
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;

      if (!groupId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID ist erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Fetch group knowledge entries
      const groupKnowledge =
        (await postgres.query(
          'SELECT id, title, content, created_by, created_at, updated_at FROM group_knowledge WHERE group_id = $1 ORDER BY created_at ASC',
          [groupId],
          { table: 'group_knowledge' }
        )) || [];

      // Fetch shared content with user profile information
      const sharedContent =
        (await postgres.query(
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
        )) || [];

      log.debug('[User Groups /content] Fetched shared content:', {
        groupId,
        totalShares: sharedContent.length,
        contentTypes: sharedContent.map((s: any) => s.content_type),
      });

      // Group shared content by type for easier processing
      const contentByType: Record<string, any[]> = {
        documents: [],
        custom_generators: [],
        notebook_collections: [],
        user_documents: [],
        database: [],
      };

      sharedContent.forEach((share: any) => {
        if (contentByType[share.content_type]) {
          contentByType[share.content_type].push(share);
        }
      });

      // Fetch actual content details for each type using SQL queries
      const contentResults: Array<{ type: string; result: { data: any[] }; shares: any[] }> = [];

      // Documents
      if (contentByType.documents.length > 0) {
        const documentIds = contentByType.documents.map((s: any) => s.content_id);
        const documentsData =
          (await postgres.query(
            `SELECT id, title, filename, file_size, status, created_at, updated_at, user_id FROM documents WHERE id = ANY($1)`,
            [documentIds],
            { table: 'documents' }
          )) || [];
        contentResults.push({
          type: 'documents',
          result: { data: documentsData },
          shares: contentByType.documents,
        });
      }

      // Custom Generators
      if (contentByType.custom_generators.length > 0) {
        const generatorIds = contentByType.custom_generators.map((s: any) => s.content_id);
        const generatorsData =
          (await postgres.query(
            `SELECT id, name, title, description, created_at, updated_at, user_id FROM custom_generators WHERE id = ANY($1)`,
            [generatorIds],
            { table: 'custom_generators' }
          )) || [];
        contentResults.push({
          type: 'custom_generators',
          result: { data: generatorsData },
          shares: contentByType.custom_generators,
        });
      }

      // Notebook Collections
      if (contentByType.notebook_collections.length > 0) {
        const notebookIds = contentByType.notebook_collections.map((s: any) => s.content_id);
        const notebooksData =
          (await postgres.query(
            `SELECT id, name, description, view_count, created_at, updated_at, user_id FROM notebook_collections WHERE id = ANY($1)`,
            [notebookIds],
            { table: 'notebook_collections' }
          )) || [];
        contentResults.push({
          type: 'notebook_collections',
          result: { data: notebooksData },
          shares: contentByType.notebook_collections,
        });
      }

      // User Documents (Texts)
      if (contentByType.user_documents.length > 0) {
        const textIds = contentByType.user_documents.map((s: any) => s.content_id);
        const rawTextsData =
          (await postgres.query(
            `SELECT id, title, document_type, content, created_at, updated_at, user_id FROM user_documents WHERE id = ANY($1)`,
            [textIds],
            { table: 'user_documents' }
          )) || [];

        // Transform data to include computed word_count and character_count
        const textsData = rawTextsData.map((item: any) => {
          let plainText = item.content || '';
          let prev = '';
          while (prev !== plainText) {
            prev = plainText;
            plainText = plainText.replace(/<[^>]*>/g, '');
          }
          plainText = plainText.trim();
          const wordCount = plainText.split(/\s+/).filter((word: string) => word.length > 0).length;
          const characterCount = plainText.length;

          return {
            ...item,
            word_count: wordCount,
            character_count: characterCount,
          };
        });

        contentResults.push({
          type: 'user_documents',
          result: { data: textsData },
          shares: contentByType.user_documents,
        });
      }

      // Templates (User Content)
      if (contentByType.database.length > 0) {
        const templateIds = contentByType.database.map((s: any) => s.content_id);
        log.debug('[User Groups /content] Fetching templates:', { templateIds });

        const templatesData =
          (await postgres.query(
            `SELECT id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id FROM user_templates WHERE id = ANY($1) AND type = 'template'`,
            [templateIds],
            { table: 'user_templates' }
          )) || [];

        log.debug('[User Groups /content] Templates fetched:', {
          requestedCount: templateIds.length,
          foundCount: templatesData.length,
          foundIds: templatesData.map((t: any) => t.id),
        });

        contentResults.push({
          type: 'database',
          result: { data: templatesData },
          shares: contentByType.database,
        });
      } else {
        log.debug(
          '[User Groups /content] No database/template shares found in group_content_shares'
        );
      }

      // Process and format results
      const groupContent: Record<string, any[]> = {
        knowledge: groupKnowledge,
        documents: [],
        generators: [],
        notebooks: [],
        texts: [],
        templates: [],
      };

      contentResults.forEach(({ type, result, shares }) => {
        const items = (result.data || []).map((item: any) => {
          // Find the corresponding share info
          const shareInfo = shares.find((s: any) => s.content_id === item.id);

          return {
            ...item,
            contentType: type,
            shared_at: shareInfo?.shared_at,
            group_permissions:
              typeof shareInfo?.permissions === 'string'
                ? JSON.parse(shareInfo.permissions)
                : shareInfo?.permissions,
            shared_by_name: shareInfo?.display_name || shareInfo?.first_name || 'Unknown User',
            // Add template-specific fields for database
            ...(type === 'database' && {
              template_type:
                (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)
                  ?.template_type || 'canva',
              canva_url: item.external_url,
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { groupId, contentId } = req.params;
      const userId = req.user!.id;
      const { contentType, permissions } = req.body;

      if (!groupId || !contentId || !contentType || !permissions) {
        res.status(400).json({
          success: false,
          message: 'Alle Parameter sind erforderlich.',
        });
        return;
      }

      // Validate content type
      if (!validContentTypes.includes(contentType)) {
        res.status(400).json({
          success: false,
          message: 'Ungültiger Content-Type.',
        });
        return;
      }

      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Check if content is shared with the group and get share info
      const shareRecord = await postgres.queryOne(
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { groupId, contentId } = req.params;
      const userId = req.user!.id;
      const { contentType } = req.body;

      if (!groupId || !contentId || !contentType) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID, Content-ID und Content-Type sind erforderlich.',
        });
        return;
      }

      // Validate content type - include database for templates
      if (!validContentTypes.includes(contentType)) {
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
      const shareRecord = await postgres.queryOne(
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
