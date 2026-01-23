/**
 * User instructions and knowledge management routes
 * Handles personal instructions for generators and knowledge entries
 */

import express, { Router, Response } from 'express';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { getProfileService } from '../../../services/user/ProfileService.js';
import { getKnowledgeService as getUserKnowledgeService } from '../../../services/user/KnowledgeService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';
import type { AuthRequest, InstructionsUpdateBody } from '../types.js';

const log = createLogger('userInstructions');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Instructions Status
// ============================================================================

router.get('/instructions-status/:instructionType', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { instructionType } = req.params;

    // Only antrag and social instruction types remain active
    const validInstructionTypes = ['antrag', 'social', 'custom_generator'];
    if (!validInstructionTypes.includes(instructionType)) {
      res.status(400).json({
        success: false,
        message: `Invalid instruction type. Valid types: ${validInstructionTypes.join(', ')}`
      });
      return;
    }

    const fieldMapping: Record<string, string[]> = {
      antrag: ['custom_antrag_prompt'],
      social: ['custom_social_prompt']
    };

    if (instructionType === 'custom_generator') {
      res.json({
        success: true,
        hasInstructions: false,
        hasGroupInstructions: false,
        instructions: {
          user: false,
          groups: []
        },
        message: 'Custom generators manage their own instruction system'
      });
      return;
    }

    const fieldsToCheck = fieldMapping[instructionType];

    const profileService = getProfileService();
    const profile = await profileService.getProfileById(userId);

    const hasUserInstructions = fieldsToCheck.some(field => {
      const value = (profile as any)?.[field];
      return value && value.trim().length > 0;
    });

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const memberships = await postgres.query(
      'SELECT group_id FROM group_memberships WHERE user_id = $1 AND is_active = true',
      [userId],
      { table: 'group_memberships' }
    );

    const groupIds = (memberships as { group_id: string }[] | undefined)?.map(m => m.group_id) || [];
    let groupsWithInstructions: string[] = [];

    const groupFieldMapping: Record<string, string[]> = {
      antrag: ['custom_antrag_prompt'],
      social: ['custom_social_prompt']
    };

    if (groupIds.length > 0 && ['antrag', 'social'].includes(instructionType)) {
      const groupFieldsToCheck = groupFieldMapping[instructionType];

      if (groupFieldsToCheck && groupIds.length > 0) {
        try {
          let groupInstructions;
          if (instructionType === 'antrag') {
            groupInstructions = await postgres.query(
              'SELECT group_id, custom_antrag_prompt FROM group_instructions WHERE group_id = ANY($1) AND is_active = true',
              [groupIds],
              { table: 'group_instructions' }
            );
          } else if (instructionType === 'social') {
            groupInstructions = await postgres.query(
              'SELECT group_id, custom_social_prompt FROM group_instructions WHERE group_id = ANY($1) AND is_active = true',
              [groupIds],
              { table: 'group_instructions' }
            );
          }

          groupsWithInstructions = groupInstructions
            ?.filter((group: any) => {
              return groupFieldsToCheck.some(field => {
                const value = group[field];
                return value && value.trim().length > 0;
              });
            })
            ?.map((group: any) => group.group_id) || [];
        } catch (groupInstructionsError) {
          log.warn(`[Instructions Status] Warning checking group instructions for ${instructionType}:`, groupInstructionsError);
        }
      }
    }

    const hasAnyInstructions = hasUserInstructions || groupsWithInstructions.length > 0;

    res.json({
      success: true,
      instructionType,
      hasUserInstructions,
      groupsWithInstructions,
      totalGroups: groupIds.length,
      hasAnyInstructions,
      checkedFields: {
        user: fieldsToCheck,
        groups: ['antrag', 'social'].includes(instructionType) ? groupFieldMapping[instructionType] || [] : []
      }
    });

  } catch (error) {
    const err = error as Error;
    log.error(`[User Content /instructions-status/${req.params.instructionType} GET] Error:`, err);
    res.status(500).json({
      success: false,
      message: 'Error checking instructions status',
      details: err.message
    });
  }
});

// ============================================================================
// Instructions & Knowledge CRUD
// ============================================================================

router.get('/anweisungen-wissen', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const profileService = getProfileService();
    const profileData = await profileService.getProfileById(userId);

    const userKnowledgeService = getUserKnowledgeService();
    const knowledgeEntries = await userKnowledgeService.getUserKnowledge(userId);

    res.json({
      success: true,
      // Unified custom prompt (new system)
      customPrompt: (profileData as any)?.custom_prompt || '',
      // Per-generator prompts (only antrag and social remain active)
      antragPrompt: (profileData as any)?.custom_antrag_prompt || '',
      antragGliederung: (profileData as any)?.custom_antrag_gliederung || '',
      socialPrompt: (profileData as any)?.custom_social_prompt || '',
      presseabbinder: (profileData as any)?.presseabbinder || '',
      knowledge: knowledgeEntries?.map(entry => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        knowledge_type: entry.knowledge_type,
        tags: entry.tags,
        created_at: entry.created_at
      })) || []
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Content /anweisungen-wissen GET] Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Daten',
      details: err.message
    });
  }
});

router.put('/anweisungen-wissen', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      custom_prompt,
      custom_antrag_prompt,
      custom_antrag_gliederung,
      custom_social_prompt,
      presseabbinder,
      knowledge = []
    } = req.body || {};

    log.debug('[User Content /anweisungen-wissen PUT] Incoming request body for user:', userId);
    log.debug('[User Content /anweisungen-wissen PUT] Request body keys:', Object.keys(req.body || {}));
    log.debug('[User Content /anweisungen-wissen PUT] Knowledge entries count:', knowledge?.length || 0);

    const profileService = getProfileService();
    const profilePayload = {
      custom_prompt: custom_prompt ?? null,
      custom_antrag_prompt: custom_antrag_prompt ?? null,
      custom_antrag_gliederung: custom_antrag_gliederung ?? null,
      custom_social_prompt: custom_social_prompt ?? null,
      presseabbinder: presseabbinder ?? null,
    };

    await profileService.updateProfile(userId, profilePayload);
    log.debug(`[User Content /anweisungen-wissen PUT] Updated profile for user ${userId}`);

    const userKnowledgeService = getUserKnowledgeService();
    let knowledgeResults = { processed: 0, deleted: 0 };

    if (knowledge && Array.isArray(knowledge)) {
      try {
        const existingKnowledge = await userKnowledgeService.getUserKnowledge(userId);
        const existingIds = existingKnowledge.map(k => k.id);

        const validEntries = knowledge.filter((entry: any) =>
          (entry.title || '').trim() || (entry.content || '').trim()
        );

        const submittedIds = validEntries
          .map((entry: any) => entry.id)
          .filter((id: any) => id && !(typeof id === 'string' && id.startsWith('new-')));

        const toDelete = existingIds.filter(id => !submittedIds.includes(id));
        for (const deleteId of toDelete) {
          await userKnowledgeService.deleteUserKnowledge(userId, deleteId);
          knowledgeResults.deleted++;
        }

        for (const entry of validEntries) {
          await userKnowledgeService.saveUserKnowledge(userId, entry);
          knowledgeResults.processed++;
        }

        log.debug(`[User Content /anweisungen-wissen PUT] Knowledge processed: ${knowledgeResults.processed} saved, ${knowledgeResults.deleted} deleted`);
      } catch (knowledgeError) {
        const err = knowledgeError as Error;
        log.error(`[User Content /anweisungen-wissen PUT] Knowledge processing failed:`, err.message);
        throw err;
      }
    }

    res.json({
      success: true,
      message: 'Profil gespeichert',
      knowledge_entries_processed: knowledgeResults.processed,
      knowledge_entries_deleted: knowledgeResults.deleted
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Content /anweisungen-wissen PUT] Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Speichern',
      details: err.message
    });
  }
});

router.delete('/anweisungen-wissen/:id', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Keine ID angegeben.'
      });
      return;
    }

    const userKnowledgeService = getUserKnowledgeService();
    await userKnowledgeService.init();

    await userKnowledgeService.deleteUserKnowledge(userId, id);

    res.json({
      success: true,
      message: 'Wissenseintrag gelöscht.'
    });

  } catch (error) {
    const err = error as Error;
    log.error(`[User Content /anweisungen-wissen/${req.params.id} DELETE] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen des Eintrags.',
      details: err.message
    });
  }
});

export default router;
