/**
 * User instructions and knowledge management routes
 * Handles personal instructions for generators and knowledge entries
 */

import express, { type Router, type Response } from 'express';

import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { getKnowledgeService as getUserKnowledgeService } from '../../../services/user/KnowledgeService.js';
import { getProfileService } from '../../../services/user/ProfileService.js';
import { createLogger } from '../../../utils/logger.js';

import type { AuthRequest, InstructionsUpdateBody } from '../types.js';

const log = createLogger('userInstructions');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Instructions & Knowledge CRUD
// ============================================================================

router.get(
  '/anweisungen-wissen',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const profileService = getProfileService();
      const profileData = await profileService.getProfileById(userId);

      const userKnowledgeService = getUserKnowledgeService();
      const knowledgeEntries = await userKnowledgeService.getUserKnowledge(userId);

      res.json({
        success: true,
        customPrompt: (profileData as any)?.custom_prompt || '',
        presseabbinder: (profileData as any)?.presseabbinder || '',
        knowledge:
          knowledgeEntries?.map((entry) => ({
            id: entry.id,
            title: entry.title,
            content: entry.content,
            knowledge_type: entry.knowledge_type,
            tags: entry.tags,
            created_at: entry.created_at,
          })) || [],
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Content /anweisungen-wissen GET] Error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Laden der Daten',
        details: err.message,
      });
    }
  }
);

router.put(
  '/anweisungen-wissen',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { custom_prompt, presseabbinder, knowledge = [] } = req.body || {};

      log.debug('[User Content /anweisungen-wissen PUT] Incoming request body for user:', userId);
      log.debug(
        '[User Content /anweisungen-wissen PUT] Request body keys:',
        Object.keys(req.body || {})
      );
      log.debug(
        '[User Content /anweisungen-wissen PUT] Knowledge entries count:',
        knowledge?.length || 0
      );

      const profileService = getProfileService();
      const profilePayload = {
        custom_prompt: custom_prompt ?? null,
        presseabbinder: presseabbinder ?? null,
      };

      await profileService.updateProfile(userId, profilePayload);
      log.debug(`[User Content /anweisungen-wissen PUT] Updated profile for user ${userId}`);

      const userKnowledgeService = getUserKnowledgeService();
      const knowledgeResults = { processed: 0, deleted: 0 };

      if (knowledge && Array.isArray(knowledge)) {
        try {
          const existingKnowledge = await userKnowledgeService.getUserKnowledge(userId);
          const existingIds = existingKnowledge.map((k) => k.id);

          const validEntries = knowledge.filter(
            (entry: any) => (entry.title || '').trim() || (entry.content || '').trim()
          );

          const submittedIds = validEntries
            .map((entry: any) => entry.id)
            .filter((id: any) => id && !(typeof id === 'string' && id.startsWith('new-')));

          const toDelete = existingIds.filter((id) => !submittedIds.includes(id));
          for (const deleteId of toDelete) {
            await userKnowledgeService.deleteUserKnowledge(userId, deleteId);
            knowledgeResults.deleted++;
          }

          for (const entry of validEntries) {
            await userKnowledgeService.saveUserKnowledge(userId, entry);
            knowledgeResults.processed++;
          }

          log.debug(
            `[User Content /anweisungen-wissen PUT] Knowledge processed: ${knowledgeResults.processed} saved, ${knowledgeResults.deleted} deleted`
          );
        } catch (knowledgeError) {
          const err = knowledgeError as Error;
          log.error(
            `[User Content /anweisungen-wissen PUT] Knowledge processing failed:`,
            err.message
          );
          throw err;
        }
      }

      res.json({
        success: true,
        message: 'Profil gespeichert',
        knowledge_entries_processed: knowledgeResults.processed,
        knowledge_entries_deleted: knowledgeResults.deleted,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Content /anweisungen-wissen PUT] Error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Speichern',
        details: err.message,
      });
    }
  }
);

router.delete(
  '/anweisungen-wissen/:id',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Keine ID angegeben.',
        });
        return;
      }

      const userKnowledgeService = getUserKnowledgeService();
      await userKnowledgeService.init();

      await userKnowledgeService.deleteUserKnowledge(userId, id);

      res.json({
        success: true,
        message: 'Wissenseintrag gelöscht.',
      });
    } catch (error) {
      const err = error as Error;
      log.error(`[User Content /anweisungen-wissen/${req.params.id} DELETE] Error:`, err.message);
      res.status(500).json({
        success: false,
        message: 'Fehler beim Löschen des Eintrags.',
        details: err.message,
      });
    }
  }
);

export default router;
