/**
 * ts-rest contract router for user-created agent CRUD.
 *
 * Replaces the legacy Express router in userAgents.ts. Covers:
 *   - GET    /api/user-agents
 *   - POST   /api/user-agents
 *   - GET    /api/user-agents/:identifier
 *   - PATCH  /api/user-agents/:identifier
 *   - DELETE /api/user-agents/:identifier
 *
 * requireAuth is applied at the /api/user-agents prefix in routes.ts. System
 * agents stay static (the registry); these rows merge in via
 * `agentLoader.getAgentForUser()`.
 */

import { userAgentsContract, type AgentFewShotExample } from '@gruenerator/contracts';
import { isUserSelectableTool } from '@gruenerator/shared/agents';
import { sortByUsage } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getUsageMap } from '../../services/usage/ItemUsageService.js';
import { draftAgentSpec } from '../../services/userAgents/agentDraftService.js';
import {
  createUserAgent,
  deleteUserAgent,
  getUserAgent,
  listUserAgents,
  updateUserAgent,
  type UserAgentInput,
  type UserAgentPatch,
} from '../../services/userAgents/userAgentsRepository.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('userAgentsContractRouter');

/** Tool keys not in the user-selectable catalog (closed set lives in shared). */
function invalidTools(tools: readonly string[] | null | undefined): string[] {
  if (!tools) return [];
  return tools.filter((t) => !isUserSelectableTool(t));
}

/**
 * Normalize few-shot examples at the boundary: Zod's `.optional()` infers
 * `reasoning?: string | undefined`, but the repository type is `reasoning?:
 * string` (exactOptionalPropertyTypes). Omit `reasoning` when absent rather
 * than forwarding an explicit `undefined`.
 */
function toFewShot(
  list: readonly AgentFewShotExample[]
): Array<{ input: string; output: string; reasoning?: string }> {
  return list.map((e) => ({
    input: e.input,
    output: e.output,
    ...(e.reasoning != null ? { reasoning: e.reasoning } : {}),
  }));
}

const s = initServer();

export const userAgentsContractRouter = s.router(userAgentsContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const agents = await listUserAgents(userId);
      // Favourites-first: float most-recently/most-used agents to the top,
      // never-used keep their creation order.
      const usageMap = await getUsageMap(userId, 'agent');
      const sorted = sortByUsage(agents, (a) => a.identifier, usageMap);
      return { status: 200 as const, body: { success: true, agents: sorted } };
    } catch (error) {
      const err = error as Error;
      log.error('[userAgentsContract.list] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  create: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const body = args.body;

      if (body.identifier.startsWith('gruenerator-')) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Bezeichner darf nicht mit "gruenerator-" beginnen.' },
        };
      }

      const bad = invalidTools(body.enabledTools);
      if (bad.length > 0) {
        return {
          status: 400 as const,
          body: { success: false, message: `Unbekannte Tools: ${bad.join(', ')}` },
        };
      }

      const input: UserAgentInput = {
        identifier: body.identifier,
        title: body.title,
        description: body.description,
        systemRole: body.systemRole,
        avatar: body.avatar,
        backgroundColor: body.backgroundColor,
        tags: body.tags,
        model: body.model,
        provider: body.provider,
        params: body.params,
        openingMessage: body.openingMessage,
        openingQuestions: body.openingQuestions,
        locale: body.locale,
        author: body.author,
        ...(body.iconKey != null ? { iconKey: body.iconKey } : {}),
        ...(body.defaultModel != null ? { defaultModel: body.defaultModel } : {}),
        ...(body.defaultNotebookIds != null ? { defaultNotebookIds: body.defaultNotebookIds } : {}),
        ...(body.plugins != null ? { plugins: body.plugins } : {}),
        ...(body.enabledTools != null ? { enabledTools: body.enabledTools } : {}),
        ...(body.skillMentions != null ? { skillMentions: body.skillMentions } : {}),
        ...(body.fewShotExamples != null
          ? { fewShotExamples: toFewShot(body.fewShotExamples) }
          : {}),
        ...(body.inlineSourceLinks != null ? { inlineSourceLinks: body.inlineSourceLinks } : {}),
      };

      const agent = await createUserAgent(userId, input);
      return { status: 201 as const, body: { success: true, agent } };
    } catch (error) {
      const err = error as Error;
      log.error('[userAgentsContract.create] Error:', err);
      if (err.message.includes('unique')) {
        return {
          status: 409 as const,
          body: {
            success: false,
            message: 'Es existiert bereits eine Agent*in mit diesem Bezeichner.',
          },
        };
      }
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  draft: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { threadId, description } = args.body;

      // Guided-assistant path: a one-shot freeform brief. No thread to load —
      // wrap it as a single user message and synthesize directly.
      if (description) {
        const spec = await draftAgentSpec([{ role: 'user', content: description }]);
        return { status: 200 as const, body: { success: true, spec } };
      }

      // Conversational path: load the (ownership-checked) thread messages.
      if (!threadId) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Noch keine Unterhaltung zum Auswerten vorhanden.' },
        };
      }
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const threads = await postgres.query<{ user_id: string }>(
        `SELECT user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
        [threadId]
      );
      if (threads.length === 0) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Thread nicht gefunden.' },
        };
      }
      if (threads[0].user_id !== userId) {
        return { status: 403 as const, body: { success: false, message: 'Keine Berechtigung.' } };
      }

      const rows = await postgres.query<{ role: string; content: unknown }>(
        `SELECT role, content FROM chat_messages
         WHERE thread_id = $1 AND role IN ('user', 'assistant')
         ORDER BY created_at ASC
         LIMIT 60`,
        [threadId]
      );
      const messages = rows
        .map((r) => ({ role: r.role, content: String(r.content ?? '').trim() }))
        .filter((m) => m.content.length > 0);

      if (messages.length === 0) {
        return {
          status: 400 as const,
          body: { success: false, message: 'Noch keine Unterhaltung zum Auswerten vorhanden.' },
        };
      }

      const spec = await draftAgentSpec(messages);
      return { status: 200 as const, body: { success: true, spec } };
    } catch (error) {
      const err = error as Error;
      log.error('[userAgentsContract.draft] Error:', err);
      return {
        status: 500 as const,
        body: { success: false, message: 'Entwurf konnte nicht erstellt werden.' },
      };
    }
  },

  get: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const agent = await getUserAgent(userId, args.params.identifier);
      if (!agent) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Agent*in nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true, agent } };
    } catch (error) {
      const err = error as Error;
      log.error('[userAgentsContract.get] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  update: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const b = args.body;

      const bad = invalidTools(b.enabledTools);
      if (bad.length > 0) {
        return {
          status: 400 as const,
          body: { success: false, message: `Unbekannte Tools: ${bad.join(', ')}` },
        };
      }

      // Build the patch field-by-field: only keys present on the body mutate a
      // column. `defaultModel` may be `null` (clear), so it's forwarded on
      // `!== undefined`; the array fields (incl. `defaultNotebookIds`) treat
      // `null` as "leave unchanged" (`!= null`) and an empty array as "clear".
      const patch: UserAgentPatch = {};
      if (b.title !== undefined) patch.title = b.title;
      if (b.description !== undefined) patch.description = b.description;
      if (b.systemRole !== undefined) patch.systemRole = b.systemRole;
      if (b.avatar !== undefined) patch.avatar = b.avatar;
      if (b.iconKey != null) patch.iconKey = b.iconKey;
      if (b.backgroundColor !== undefined) patch.backgroundColor = b.backgroundColor;
      if (b.tags !== undefined) patch.tags = b.tags;
      if (b.model !== undefined) patch.model = b.model;
      if (b.defaultModel !== undefined) patch.defaultModel = b.defaultModel;
      if (b.provider !== undefined) patch.provider = b.provider;
      if (b.params !== undefined) patch.params = b.params;
      if (b.openingMessage !== undefined) patch.openingMessage = b.openingMessage;
      if (b.openingQuestions !== undefined) patch.openingQuestions = b.openingQuestions;
      if (b.locale !== undefined) patch.locale = b.locale;
      if (b.author !== undefined) patch.author = b.author;
      if (b.defaultNotebookIds != null) patch.defaultNotebookIds = b.defaultNotebookIds;
      if (b.plugins != null) patch.plugins = b.plugins;
      if (b.enabledTools != null) patch.enabledTools = b.enabledTools;
      if (b.skillMentions != null) patch.skillMentions = b.skillMentions;
      if (b.fewShotExamples != null) patch.fewShotExamples = toFewShot(b.fewShotExamples);
      if (b.inlineSourceLinks != null) patch.inlineSourceLinks = b.inlineSourceLinks;

      const agent = await updateUserAgent(userId, args.params.identifier, patch);
      if (!agent) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Agent*in nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true, agent } };
    } catch (error) {
      const err = error as Error;
      log.error('[userAgentsContract.update] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },

  remove: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const ok = await deleteUserAgent(userId, args.params.identifier);
      if (!ok) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Agent*in nicht gefunden.' },
        };
      }
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      const err = error as Error;
      log.error('[userAgentsContract.remove] Error:', err);
      return { status: 500 as const, body: { success: false, message: err.message } };
    }
  },
});

/**
 * Mount the ts-rest user-agents contract router. Call from routes.ts. requireAuth
 * is applied at the /api/user-agents prefix.
 */
export function mountUserAgentsContractRouter(app: Application): void {
  createExpressEndpoints(userAgentsContract, userAgentsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userAgentsContract'),
  });
}
