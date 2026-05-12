/**
 * User custom prompts management routes
 * Handles custom prompt CRUD, saved prompts, and semantic search
 */

import { randomBytes } from 'crypto';

import { generateText } from 'ai';
import { and, eq, type InferSelectModel } from 'drizzle-orm';
import express, { type Router, type Response } from 'express';

import { customPrompts, savedPrompts } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { getIntermediateModel } from '../../services/ai/providers.js';
import { getPromptVectorService } from '../../services/prompts/index.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthRequest } from './types.js';

type CustomPromptRow = InferSelectModel<typeof customPrompts>;

const log = createLogger('userCustomPrompts');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const postgres = getPostgresInstance();
const promptVectorService = getPromptVectorService();

const router: Router = express.Router();

interface CustomPromptCreateBody {
  prompt: string;
  is_public?: boolean;
}

interface CustomPromptUpdateBody {
  prompt?: string;
  is_public?: boolean;
}

function generateSlug(): string {
  return randomBytes(6).toString('hex');
}

async function generatePromptName(promptText: string): Promise<string> {
  try {
    const result = await generateText({
      model: getIntermediateModel(),
      prompt: `Generate a short, descriptive German title (3-5 words) for this prompt template. Only respond with the title, nothing else.\n\nPrompt:\n${promptText.substring(0, 500)}`,
      maxOutputTokens: 30,
      temperature: 0.3,
    });

    const name = result.text.trim();
    return name || 'Mein Prompt';
  } catch (error) {
    log.warn('Failed to generate prompt name:', error);
    return 'Mein Prompt';
  }
}

// GET /custom_prompts - List user's prompts
router.get(
  '/custom_prompts',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const prompts = await postgres.query(
        `SELECT id, name, slug, prompt, description, is_public, created_at, updated_at, is_active, usage_count
       FROM custom_prompts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
        [userId],
        { table: 'custom_prompts' }
      );

      res.json({
        success: true,
        prompts: prompts || [],
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /custom_prompts GET] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Prompts.',
      });
    }
  }
);

// POST /custom_prompts - Create prompt
router.post(
  '/custom_prompts',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { prompt, is_public } = req.body as CustomPromptCreateBody;

      if (!prompt?.trim()) {
        res.status(400).json({
          success: false,
          message: 'Prompt ist erforderlich.',
        });
        return;
      }

      const slug = generateSlug();
      const name = await generatePromptName(prompt.trim());

      const db = getDrizzleInstance();
      const rows = await db
        .insert(customPrompts)
        .values({
          user_id: userId,
          name,
          slug,
          prompt: prompt.trim(),
          is_public: is_public === true,
        })
        .returning();

      const newPrompt: CustomPromptRow | null = rows[0] ?? null;

      if (newPrompt) {
        promptVectorService
          .indexPrompt({
            id: newPrompt.id,
            user_id: userId,
            name: newPrompt.name,
            slug: newPrompt.slug,
            prompt: newPrompt.prompt,
            description: null,
            is_public: newPrompt.is_public,
          })
          .catch((err) => log.warn('Failed to index prompt:', err));
      }

      res.json({
        success: true,
        prompt: newPrompt,
        message: 'Prompt erfolgreich erstellt!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /custom_prompts POST] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Erstellen des Prompts.',
      });
    }
  }
);

// PUT /custom_prompts/:id - Update prompt
router.put(
  '/custom_prompts/:id',
  ensureAuthenticated,
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { prompt, is_public } = req.body as CustomPromptUpdateBody;

      const db = getDrizzleInstance();
      const existing = await db
        .select({
          id: customPrompts.id,
          user_id: customPrompts.user_id,
          prompt: customPrompts.prompt,
          name: customPrompts.name,
          is_public: customPrompts.is_public,
        })
        .from(customPrompts)
        .where(eq(customPrompts.id, id))
        .limit(1);

      const existingPrompt = existing[0] ?? null;

      if (!existingPrompt) {
        res.status(404).json({ success: false, message: 'Prompt nicht gefunden.' });
        return;
      }

      if (existingPrompt.user_id !== userId) {
        res.status(403).json({ success: false, message: 'Keine Berechtigung.' });
        return;
      }

      const newPromptText = prompt?.trim() || existingPrompt.prompt;
      const promptChanged = prompt && prompt.trim() !== existingPrompt.prompt;
      const newName = promptChanged ? await generatePromptName(newPromptText) : existingPrompt.name;

      const updated = await db
        .update(customPrompts)
        .set({
          name: newName,
          prompt: newPromptText,
          is_public: is_public ?? existingPrompt.is_public,
          updated_at: new Date(),
        })
        .where(and(eq(customPrompts.id, id), eq(customPrompts.user_id, userId)))
        .returning();

      const updatedPrompt: CustomPromptRow | null = updated[0] ?? null;

      if (updatedPrompt && promptChanged) {
        promptVectorService
          .indexPrompt({
            id: updatedPrompt.id,
            user_id: userId,
            name: updatedPrompt.name,
            slug: updatedPrompt.slug,
            prompt: updatedPrompt.prompt,
            description: null,
            is_public: updatedPrompt.is_public,
          })
          .catch((err) => log.warn('Failed to re-index prompt:', err));
      }

      res.json({ success: true, prompt: updatedPrompt, message: 'Prompt aktualisiert!' });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /custom_prompts/:id PUT] Error:', { error: err });
      res
        .status(500)
        .json({ success: false, message: err.message || 'Fehler beim Aktualisieren.' });
    }
  }
);

// DELETE /custom_prompts/:id - Delete prompt
router.delete(
  '/custom_prompts/:id',
  ensureAuthenticated,
  async (req: AuthRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const db = getDrizzleInstance();
      const existing = await db
        .select({
          id: customPrompts.id,
          user_id: customPrompts.user_id,
          name: customPrompts.name,
          embedding_id: customPrompts.embedding_id,
        })
        .from(customPrompts)
        .where(eq(customPrompts.id, id))
        .limit(1);

      const existingPrompt = existing[0] ?? null;

      if (!existingPrompt) {
        res.status(404).json({
          success: false,
          message: 'Prompt nicht gefunden.',
        });
        return;
      }

      if (existingPrompt.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: 'Keine Berechtigung zum Löschen dieses Prompts.',
        });
        return;
      }

      if (existingPrompt.embedding_id) {
        promptVectorService
          .deletePromptVector(id)
          .catch((err) => log.warn('Failed to delete prompt vectors:', err));
      }

      await db
        .delete(customPrompts)
        .where(and(eq(customPrompts.id, id), eq(customPrompts.user_id, userId)));

      log.debug(
        `[User Custom Prompts] Prompt "${existingPrompt.name}" (${id}) deleted by user ${userId}`
      );

      res.json({
        success: true,
        message: 'Prompt erfolgreich gelöscht!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /custom_prompts/:id DELETE] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Löschen des Prompts.',
      });
    }
  }
);

// GET /saved_prompts - List saved prompts
router.get(
  '/saved_prompts',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const savedPromptsList = await postgres.query(
        `SELECT
        cp.id, cp.name, cp.slug, cp.prompt, cp.description, cp.is_public,
        cp.created_at, cp.updated_at, cp.is_active, cp.usage_count,
        cp.user_id as owner_id, sp.saved_at,
        p.first_name as owner_first_name, p.last_name as owner_last_name
       FROM saved_prompts sp
       JOIN custom_prompts cp ON cp.id = sp.prompt_id
       LEFT JOIN profiles p ON p.id = cp.user_id
       WHERE sp.user_id = $1 AND cp.is_active = true
       ORDER BY sp.saved_at DESC`,
        [userId],
        { table: 'saved_prompts' }
      );

      res.json({
        success: true,
        prompts: savedPromptsList || [],
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /saved_prompts GET] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der gespeicherten Prompts.',
      });
    }
  }
);

// POST /saved_prompts/:promptId - Save another user's prompt
router.post(
  '/saved_prompts/:promptId',
  ensureAuthenticated,
  async (req: AuthRequest<{ promptId: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { promptId } = req.params;

      const db = getDrizzleInstance();
      const existing = await db
        .select({
          id: customPrompts.id,
          user_id: customPrompts.user_id,
          name: customPrompts.name,
          is_active: customPrompts.is_active,
        })
        .from(customPrompts)
        .where(eq(customPrompts.id, promptId))
        .limit(1);

      const promptData = existing[0] ?? null;

      if (!promptData) {
        res.status(404).json({
          success: false,
          message: 'Prompt nicht gefunden.',
        });
        return;
      }

      if (!promptData.is_active) {
        res.status(400).json({
          success: false,
          message: 'Dieser Prompt ist nicht mehr aktiv.',
        });
        return;
      }

      if (promptData.user_id === userId) {
        res.status(400).json({
          success: false,
          message: 'Du kannst deinen eigenen Prompt nicht speichern.',
        });
        return;
      }

      const existingSave = await db
        .select({ id: savedPrompts.id })
        .from(savedPrompts)
        .where(and(eq(savedPrompts.user_id, userId), eq(savedPrompts.prompt_id, promptId)))
        .limit(1);

      if (existingSave.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Prompt ist bereits gespeichert.',
        });
        return;
      }

      await db.insert(savedPrompts).values({ user_id: userId, prompt_id: promptId });

      log.debug(
        `[User Custom Prompts] Prompt "${promptData.name}" (${promptId}) saved by user ${userId}`
      );

      res.json({
        success: true,
        message: 'Prompt erfolgreich gespeichert!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /saved_prompts/:promptId POST] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Speichern des Prompts.',
      });
    }
  }
);

// DELETE /saved_prompts/:promptId - Unsave prompt
router.delete(
  '/saved_prompts/:promptId',
  ensureAuthenticated,
  async (req: AuthRequest<{ promptId: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { promptId } = req.params;

      const db = getDrizzleInstance();
      const result = await db
        .delete(savedPrompts)
        .where(and(eq(savedPrompts.user_id, userId), eq(savedPrompts.prompt_id, promptId)))
        .returning({ id: savedPrompts.id });

      if (result.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Gespeicherter Prompt nicht gefunden.',
        });
        return;
      }

      log.debug(`[User Custom Prompts] Saved prompt ${promptId} removed by user ${userId}`);

      res.json({
        success: true,
        message: 'Prompt erfolgreich entfernt!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Custom Prompts /saved_prompts/:promptId DELETE] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Entfernen des Prompts.',
      });
    }
  }
);

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
      log.error('[User Custom Prompts /custom_prompts/search POST] Error:', { error: err });
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
      log.error('[User Custom Prompts /public_prompts GET] Error:', { error: err });
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
      log.error('[User Custom Prompts /public_prompts/search POST] Error:', { error: err });
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler bei der Suche.',
      });
    }
  }
);

export default router;
