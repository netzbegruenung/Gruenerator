/**
 * Custom Generator Routes
 * Handles fetching and executing custom generator configurations
 */

import express, { Response, Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('custom_generator');
const postgres = getPostgresInstance();
const router: Router = express.Router();

interface CustomGeneratorRow {
  id: string;
  name: string;
  slug: string;
  title: string;
  description: string;
  form_schema: Record<string, any>;
  prompt: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  usage_count: number;
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
}

interface SavedGeneratorRow {
  id: string;
}

interface GeneratorResponse {
  success: boolean;
  generator?: CustomGeneratorRow & {
    is_owner: boolean;
    is_saved: boolean;
  };
  message?: string;
}

/**
 * GET /:slug - Fetch generator configuration by slug
 */
router.get(
  '/:slug',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response<GeneratorResponse>): Promise<void> => {
    try {
      const { slug } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Nicht autorisiert.',
        });
        return;
      }

      log.debug(
        `[custom_generator] GET /:slug - Fetching generator with slug: ${slug} for user: ${userId}`
      );

      const generator = (await postgres.queryOne(
        `SELECT cg.id, cg.name, cg.slug, cg.title, cg.description, cg.form_schema, cg.prompt, cg.contact_email,
              cg.created_at, cg.updated_at, cg.is_active, cg.usage_count, cg.user_id as owner_id,
              p.first_name as owner_first_name, p.last_name as owner_last_name, p.email as owner_email
       FROM custom_generators cg
       LEFT JOIN profiles p ON p.id = cg.user_id
       WHERE cg.slug = $1 AND cg.is_active = true`,
        [slug],
        { table: 'custom_generators' }
      )) as unknown as CustomGeneratorRow | null;

      if (!generator) {
        log.debug(`[custom_generator] Generator not found for slug: ${slug}`);
        res.status(404).json({
          success: false,
          message: 'Generator nicht gefunden.',
        });
        return;
      }

      const isOwner = generator.owner_id === userId;

      let isSaved = false;
      if (!isOwner) {
        const savedCheck = (await postgres.queryOne(
          `SELECT id FROM saved_generators WHERE user_id = $1 AND generator_id = $2`,
          [userId, generator.id],
          { table: 'saved_generators' }
        )) as unknown as SavedGeneratorRow | null;
        isSaved = !!savedCheck;
      }

      await postgres.query(
        `UPDATE custom_generators SET usage_count = usage_count + 1 WHERE id = $1`,
        [generator.id],
        { table: 'custom_generators' }
      );

      res.json({
        success: true,
        generator: {
          ...generator,
          is_owner: isOwner,
          is_saved: isSaved,
        },
      });
    } catch (error) {
      const err = error as Error;
      log.error('[custom_generator] Error fetching generator:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden des Generators.',
      });
    }
  }
);

/**
 * POST / - Execute custom generator via promptProcessor
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  log.debug('[custom_generator] Request received via promptProcessor');
  await processGraphRequest('custom_generator', req, res);
});

export default router;
