/**
 * Custom Prompt Routes
 * Handles fetching, executing, and searching custom prompt configurations
 */

import express, { Request, Response, Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../../utils/logger.js';
import { getPromptVectorService } from '../../services/prompts/index.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('custom_prompt');
const postgres = getPostgresInstance();
const promptVectorService = getPromptVectorService();
const router: Router = express.Router();

interface CustomPromptRow {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  usage_count: number;
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
}

interface SavedPromptRow {
  id: string;
}

interface PromptResponse {
  success: boolean;
  prompt?: CustomPromptRow & {
    is_owner: boolean;
    is_saved: boolean;
    is_public: boolean;
  };
  message?: string;
}

/**
 * GET /:slug - Fetch prompt configuration by slug
 */
router.get('/:slug', requireAuth, async (req: AuthenticatedRequest, res: Response<PromptResponse>): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Nicht autorisiert.'
      });
      return;
    }

    log.debug(`[custom_prompt] GET /:slug - Fetching prompt with slug: ${slug} for user: ${userId}`);

    const promptData = await postgres.queryOne(
      `SELECT cp.id, cp.name, cp.slug, cp.prompt, cp.description, cp.is_public,
              cp.created_at, cp.updated_at, cp.is_active, cp.usage_count, cp.user_id as owner_id,
              p.first_name as owner_first_name, p.last_name as owner_last_name
       FROM custom_prompts cp
       LEFT JOIN profiles p ON p.id = cp.user_id
       WHERE cp.slug = $1 AND cp.is_active = true`,
      [slug],
      { table: 'custom_prompts' }
    ) as unknown as CustomPromptRow | null;

    if (!promptData) {
      log.debug(`[custom_prompt] Prompt not found for slug: ${slug}`);
      res.status(404).json({
        success: false,
        message: 'Prompt nicht gefunden.'
      });
      return;
    }

    const isOwner = promptData.owner_id === userId;

    let isSaved = false;
    if (!isOwner) {
      const savedCheck = await postgres.queryOne(
        `SELECT id FROM saved_prompts WHERE user_id = $1 AND prompt_id = $2`,
        [userId, promptData.id],
        { table: 'saved_prompts' }
      ) as unknown as SavedPromptRow | null;
      isSaved = !!savedCheck;
    }

    await postgres.query(
      `UPDATE custom_prompts SET usage_count = usage_count + 1 WHERE id = $1`,
      [promptData.id],
      { table: 'custom_prompts' }
    );

    res.json({
      success: true,
      prompt: {
        ...promptData,
        is_owner: isOwner,
        is_saved: isSaved
      }
    });

  } catch (error) {
    const err = error as Error;
    log.error('[custom_prompt] Error fetching prompt:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden des Prompts.'
    });
  }
});

/**
 * POST / - Execute custom prompt via promptProcessor
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  log.debug('[custom_prompt] Request received via promptProcessor');
  await processGraphRequest('custom_prompt', req, res);
});

/**
 * POST /search - Public semantic search for prompts (no auth required for basic search)
 */
router.post('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit = 10, threshold = 0.3 } = req.body as { query: string; limit?: number; threshold?: number };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Suchbegriff ist erforderlich.'
      });
      return;
    }

    const searchResult = await promptVectorService.searchPublicPrompts(
      query.trim(),
      { limit: Math.min(limit, 50), threshold }
    );

    res.json({
      ...searchResult,
      success: true
    });

  } catch (error) {
    const err = error as Error;
    log.error('[custom_prompt] Search error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler bei der Suche.'
    });
  }
});

export default router;
