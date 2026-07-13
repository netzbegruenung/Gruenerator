/**
 * ts-rest router for /api/auth/custom_prompts and /api/auth/saved_prompts.
 *
 * Replaces the equivalent handlers in userCustomPrompts.ts (which now only
 * owns the semantic-search / discovery endpoints). Mounts BEFORE the legacy
 * authRouter so ts-rest matches its own routes first; unmatched paths fall
 * through to the Express fallback.
 */
import { randomBytes } from 'crypto';

import { promptsContract, type CustomPrompt } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { generateText } from 'ai';
import { and, eq } from 'drizzle-orm';

import { customPrompts, savedPrompts } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getIntermediateModel } from '../../services/ai/providers.js';
import { getPromptVectorService } from '../../services/prompts/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('promptsContract');
const postgres = getPostgresInstance();
const promptVectorService = getPromptVectorService();

const s = initServer();

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Wire shape of a prompt row. Both the raw-SQL list rows and the Drizzle
 * `.returning()` rows arrive with `Date` timestamps; the contract types them
 * as ISO strings (what res.json produces), so we normalise here.
 */
interface PromptRowInput {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  description: string | null;
  is_public: boolean;
  is_active: boolean;
  usage_count: number;
  created_at: Date | string;
  updated_at: Date | string | null;
  owner_id?: string | null;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  saved_at?: Date | string | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toWirePrompt(row: PromptRowInput): CustomPrompt {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    prompt: row.prompt,
    description: row.description,
    is_public: row.is_public,
    is_active: row.is_active,
    usage_count: row.usage_count,
    created_at: toIso(row.created_at) ?? '',
    updated_at: toIso(row.updated_at),
    ...(row.owner_id !== undefined && { owner_id: row.owner_id }),
    ...(row.owner_first_name !== undefined && { owner_first_name: row.owner_first_name }),
    ...(row.owner_last_name !== undefined && { owner_last_name: row.owner_last_name }),
    ...(row.saved_at !== undefined && { saved_at: toIso(row.saved_at) }),
  };
}

// ── Router ───────────────────────────────────────────────────────────────────

export const promptsContractRouter = s.router(promptsContract, {
  listCustomPrompts: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const rows = await postgres.query<PromptRowInput>(
        `SELECT id, name, slug, prompt, description, is_public, created_at, updated_at, is_active, usage_count
         FROM custom_prompts
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
        { table: 'custom_prompts' }
      );

      return {
        status: 200 as const,
        body: { success: true as const, prompts: rows.map(toWirePrompt) },
      };
    } catch (error) {
      log.error('[Prompts Contract] listCustomPrompts error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Laden der Prompts.',
        },
      };
    }
  },

  createCustomPrompt: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { prompt, is_public } = args.body;

      if (!prompt?.trim()) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Prompt ist erforderlich.' },
        };
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

      const newPrompt = rows[0] ?? null;

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

      return {
        status: 200 as const,
        body: {
          success: true as const,
          prompt: newPrompt ? toWirePrompt(newPrompt) : null,
          message: 'Prompt erfolgreich erstellt!',
        },
      };
    } catch (error) {
      log.error('[Prompts Contract] createCustomPrompt error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Erstellen des Prompts.',
        },
      };
    }
  },

  updateCustomPrompt: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { id } = args.params;
      const { prompt, is_public } = args.body;

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
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Prompt nicht gefunden.' },
        };
      }

      if (existingPrompt.user_id !== userId) {
        return {
          status: 403 as const,
          body: { success: false as const, message: 'Keine Berechtigung.' },
        };
      }

      const newPromptText = prompt?.trim() || existingPrompt.prompt;
      const promptChanged = Boolean(prompt && prompt.trim() !== existingPrompt.prompt);
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

      const updatedPrompt = updated[0] ?? null;

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

      return {
        status: 200 as const,
        body: {
          success: true as const,
          prompt: updatedPrompt ? toWirePrompt(updatedPrompt) : null,
          message: 'Prompt aktualisiert!',
        },
      };
    } catch (error) {
      log.error('[Prompts Contract] updateCustomPrompt error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Aktualisieren.',
        },
      };
    }
  },

  deleteCustomPrompt: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { id } = args.params;

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
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Prompt nicht gefunden.' },
        };
      }

      if (existingPrompt.user_id !== userId) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Keine Berechtigung zum Löschen dieses Prompts.',
          },
        };
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
        `[Prompts Contract] Prompt "${existingPrompt.name}" (${id}) deleted by user ${userId}`
      );

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Prompt erfolgreich gelöscht!' },
      };
    } catch (error) {
      log.error('[Prompts Contract] deleteCustomPrompt error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Löschen des Prompts.',
        },
      };
    }
  },

  listSavedPrompts: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;

      const rows = await postgres.query<PromptRowInput>(
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

      return {
        status: 200 as const,
        body: { success: true as const, prompts: rows.map(toWirePrompt) },
      };
    } catch (error) {
      log.error('[Prompts Contract] listSavedPrompts error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Laden der gespeicherten Prompts.',
        },
      };
    }
  },

  saveSavedPrompt: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { promptId } = args.params;

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
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Prompt nicht gefunden.' },
        };
      }

      if (!promptData.is_active) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Dieser Prompt ist nicht mehr aktiv.' },
        };
      }

      if (promptData.user_id === userId) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message: 'Du kannst deinen eigenen Prompt nicht speichern.',
          },
        };
      }

      const existingSave = await db
        .select({ id: savedPrompts.id })
        .from(savedPrompts)
        .where(and(eq(savedPrompts.user_id, userId), eq(savedPrompts.prompt_id, promptId)))
        .limit(1);

      if (existingSave.length > 0) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Prompt ist bereits gespeichert.' },
        };
      }

      await db.insert(savedPrompts).values({ user_id: userId, prompt_id: promptId });

      log.debug(
        `[Prompts Contract] Prompt "${promptData.name}" (${promptId}) saved by user ${userId}`
      );

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Prompt erfolgreich gespeichert!' },
      };
    } catch (error) {
      log.error('[Prompts Contract] saveSavedPrompt error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Speichern des Prompts.',
        },
      };
    }
  },

  deleteSavedPrompt: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { promptId } = args.params;

      const db = getDrizzleInstance();
      const result = await db
        .delete(savedPrompts)
        .where(and(eq(savedPrompts.user_id, userId), eq(savedPrompts.prompt_id, promptId)))
        .returning({ id: savedPrompts.id });

      if (result.length === 0) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Gespeicherter Prompt nicht gefunden.' },
        };
      }

      log.debug(`[Prompts Contract] Saved prompt ${promptId} removed by user ${userId}`);

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Prompt erfolgreich entfernt!' },
      };
    } catch (error) {
      log.error('[Prompts Contract] deleteSavedPrompt error:', error);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: (error as Error).message || 'Fehler beim Entfernen des Prompts.',
        },
      };
    }
  },
});

/**
 * Mount the ts-rest prompts router onto an Express app instance.
 * Call from routes.ts BEFORE the legacy authRouter mount.
 */
export function mountPromptsContractRouter(app: Application): void {
  createExpressEndpoints(promptsContract, promptsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'promptsContract'),
  });
}
