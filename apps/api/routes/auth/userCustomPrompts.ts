/**
 * User prompt discovery routes (semantic search + public prompts).
 *
 * The custom_prompts / saved_prompts CRUD surface has been migrated to the
 * ts-rest contract router (promptsContractRouter.ts). This router retains only
 * the loosely-typed vector-search / discovery endpoints, which are not
 * contract-modeled.
 */

import express, { type Router, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { getPromptVectorService } from '../../services/prompts/index.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthRequest } from './types.js';

const log = createLogger('userCustomPrompts');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const postgres = getPostgresInstance();
const promptVectorService = getPromptVectorService();

const router: Router = express.Router();

// POST /custom_prompts/search - Semantic search user's own prompts
router.post(
  '/custom_prompts/search',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const {
        query,
        limit = 10,
        threshold = 0.3,
      } = req.body as { query: string; limit?: number; threshold?: number };

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: 'Suchbegriff ist erforderlich.',
        });
        return;
      }

      const searchResult = await promptVectorService.searchUserPrompts(userId, query.trim(), {
        limit: Math.min(limit, 50),
        threshold,
      });

      res.json({
        ...searchResult,
        success: true,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /custom_prompts/search POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler bei der Suche.',
      });
    }
  }
);

// GET /public_prompts - Get public prompts for discovery with search support
router.get(
  '/public_prompts',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const searchTerm = (req.query.searchTerm as string)?.trim();
      const searchMode = (req.query.searchMode as string) || 'title';

      if (searchTerm && searchMode === 'semantic') {
        const searchResult = await promptVectorService.searchPublicPrompts(
          searchTerm,
          { limit, threshold: 0.3 },
          userId
        );
        res.json({
          ...searchResult,
          success: true,
        });
        return;
      }

      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        const whereClause =
          searchMode === 'fulltext'
            ? `AND (cp.name ILIKE $2 OR cp.prompt ILIKE $2 OR cp.description ILIKE $2)`
            : `AND cp.name ILIKE $2`;

        const results = await postgres.query(
          `SELECT
          cp.id as prompt_id, cp.name, cp.slug, cp.prompt,
          SUBSTRING(cp.prompt, 1, 200) as prompt_preview,
          cp.description, cp.is_public, cp.created_at,
          p.first_name as owner_first_name
         FROM custom_prompts cp
         LEFT JOIN profiles p ON p.id = cp.user_id
         WHERE cp.is_public = true AND cp.is_active = true
         AND (cp.user_id IS NULL OR cp.user_id != $1)
         ${whereClause}
         ORDER BY cp.usage_count DESC, cp.created_at DESC
         LIMIT ${limit}`,
          [userId, searchPattern],
          { table: 'custom_prompts' }
        );

        res.json({
          success: true,
          results: results || [],
          count: (results || []).length,
        });
        return;
      }

      const result = await promptVectorService.getPublicPrompts(limit, userId);
      res.json({
        ...result,
        success: true,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /public_prompts GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der öffentlichen Prompts.',
      });
    }
  }
);

// POST /public_prompts/search - Semantic search public prompts
router.post(
  '/public_prompts/search',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const {
        query,
        limit = 10,
        threshold = 0.3,
      } = req.body as { query: string; limit?: number; threshold?: number };

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: 'Suchbegriff ist erforderlich.',
        });
        return;
      }

      const searchResult = await promptVectorService.searchPublicPrompts(
        query.trim(),
        { limit: Math.min(limit, 50), threshold },
        userId
      );

      res.json({
        ...searchResult,
        success: true,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /public_prompts/search POST] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler bei der Suche.',
      });
    }
  }
);

export default router;
