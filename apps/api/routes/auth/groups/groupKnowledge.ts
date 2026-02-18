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
// Instructions Endpoints
// ============================================================================

// Get group instructions
router.get(
  '/groups/:groupId/instructions',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
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

      // Fetch instructions (only custom_prompt and instructions_enabled remain active)
      const instructions = await postgres.queryOne(
        'SELECT group_id, custom_prompt, instructions_enabled FROM group_instructions WHERE group_id = $1',
        [groupId],
        { table: 'group_instructions' }
      );

      res.json({
        success: true,
        instructions: instructions || {
          group_id: groupId,
          custom_prompt: '',
          instructions_enabled: false,
        },
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/instructions GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Gruppenanweisungen.',
      });
    }
  }
);

// Update group instructions (simplified - only custom_prompt and instructions_enabled)
router.put(
  '/groups/:groupId/instructions',
  ensureAuthenticated as any,
  async (req: AuthRequest<{ groupId: string }>, res: Response): Promise<void> => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.id;
      const { custom_prompt, instructions_enabled } = req.body;

      if (!groupId) {
        res.status(400).json({
          success: false,
          message: 'Gruppen-ID ist erforderlich.',
        });
        return;
      }

      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

      // Build update object
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (custom_prompt !== undefined) {
        updateFields.push(`custom_prompt = $${paramIndex++}`);
        updateValues.push(custom_prompt);
      }
      if (instructions_enabled !== undefined) {
        updateFields.push(`instructions_enabled = $${paramIndex++}`);
        updateValues.push(instructions_enabled);
      }

      if (updateFields.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Keine Änderungen angegeben.',
        });
        return;
      }

      // Add groupId as the last parameter for WHERE clause
      updateValues.push(groupId);

      // Update instructions using UPSERT
      const upsertSQL = `
      INSERT INTO group_instructions (group_id, ${updateFields.map((f) => f.split(' = ')[0]).join(', ')})
      VALUES ($${paramIndex}, ${updateFields.map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (group_id)
      DO UPDATE SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    `;

      await postgres.exec(upsertSQL, updateValues);

      res.json({
        success: true,
        message: 'Gruppenanweisungen erfolgreich aktualisiert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Groups /groups/:groupId/instructions PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Gruppenanweisungen.',
      });
    }
  }
);

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
