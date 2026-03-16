/**
 * Group knowledge and instructions routes
 * Handles group instructions configuration and knowledge entries
 */

import express, { type Router, type Response } from 'express';

import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';

import { getPostgresAndCheckMembership } from './groupCore.js';

import type { AuthRequest } from '../types.js';

const log = createLogger('groupKnowledge');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Knowledge Endpoints
// ============================================================================

// Add knowledge entry
router.post(
  '/groups/:groupId/knowledge',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { title, content } = req.body;

      if (!groupId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID ist erforderlich.',
        });
        return;
      }

      if (!content?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Inhalt ist erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      // Insert knowledge entry
      const newKnowledge = await postgres.queryOne(
        `INSERT INTO group_knowledge (group_id, title, content, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, content, created_by, created_at, updated_at`,
        [groupId, title?.trim() || 'Untitled', content.trim(), userId],
        { table: 'group_knowledge' }
      );

      if (!newKnowledge) {
        throw new Error('Failed to create knowledge entry');
      }

      res.json({
        success: true,
        knowledge: newKnowledge,
        message: 'Gruppenwissen erfolgreich hinzugefügt.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/knowledge POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Hinzufügen des Gruppenwissens.',
      });
    }
  }
);

// Get individual knowledge entry
router.get(
  '/groups/:groupId/knowledge/:knowledgeId',
  ensureAuthenticated as any,
  async (
    req: AuthRequest<{ groupId: string; knowledgeId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const { groupId, knowledgeId } = req.params;
      const userId = req.user!.id;

      if (!groupId || !knowledgeId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID und Wissens-ID sind erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      // Fetch the specific knowledge entry
      const knowledge = await postgres.queryOne(
        'SELECT id, title, content, created_by, created_at, updated_at FROM group_knowledge WHERE id = $1 AND group_id = $2',
        [knowledgeId, groupId],
        { table: 'group_knowledge' }
      );

      if (!knowledge) {
        res.status(404).json({
          success: false,
          message: 'Wissenseintrag nicht gefunden.',
        });
        return;
      }

      res.json({
        success: true,
        knowledge: knowledge,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/knowledge/:knowledgeId GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden des Wissenseintrags.',
      });
    }
  }
);

// Update knowledge entry
router.put(
  '/groups/:groupId/knowledge/:knowledgeId',
  ensureAuthenticated as any,
  async (
    req: AuthRequest<{ groupId: string; knowledgeId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const { groupId, knowledgeId } = req.params;
      const userId = req.user!.id;
      const { title, content } = req.body;

      if (!groupId || !knowledgeId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID und Wissens-ID sind erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      // Build update object
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(title?.trim() || 'Untitled');
      }
      if (content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        updateValues.push(content?.trim() || '');
      }

      if (updateFields.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Keine Änderungen angegeben.',
        });
        return;
      }

      // Add updated_at
      updateFields.push(`updated_at = $${paramIndex++}`);
      updateValues.push(new Date().toISOString());

      // Add IDs for WHERE clause
      updateValues.push(knowledgeId);
      updateValues.push(groupId);

      // Update knowledge entry
      const updateSQL = `UPDATE group_knowledge SET ${updateFields.join(', ')} WHERE id = $${paramIndex++} AND group_id = $${paramIndex} RETURNING id, title, content, created_by, created_at, updated_at`;
      const updatedKnowledge = await postgres.queryOne(updateSQL, updateValues, {
        table: 'group_knowledge',
      });

      if (!updatedKnowledge) {
        throw new Error('Knowledge entry not found or no changes made');
      }

      res.json({
        success: true,
        knowledge: updatedKnowledge,
        message: 'Gruppenwissen erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/knowledge/:knowledgeId PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren des Gruppenwissens.',
      });
    }
  }
);

// Delete knowledge entry
router.delete(
  '/groups/:groupId/knowledge/:knowledgeId',
  ensureAuthenticated as any,
  async (
    req: AuthRequest<{ groupId: string; knowledgeId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const { groupId, knowledgeId } = req.params;
      const userId = req.user!.id;

      if (!groupId || !knowledgeId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID und Wissens-ID sind erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      // Delete knowledge entry
      const result = await postgres.exec(
        'DELETE FROM group_knowledge WHERE id = $1 AND group_id = $2',
        [knowledgeId, groupId]
      );

      if (result.changes === 0) {
        res.status(404).json({
          success: false,
          message: 'Wissenseintrag nicht gefunden.',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Gruppenwissen erfolgreich gelöscht.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/knowledge/:knowledgeId DELETE] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Löschen des Gruppenwissens.',
      });
    }
  }
);

export default router;
