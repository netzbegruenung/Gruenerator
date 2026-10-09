/**
 * ts-rest router for the owner's explainables. requireAuth sits at the
 * `/api/explainables` prefix in routes.ts; createFromMessage additionally
 * behind aiGenerationLimiter + requireAiConsent.
 */
import crypto from 'node:crypto';

import { explainablesContract, type ExplainableSource } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  createExplainable,
  type CreateExplainableInput,
  type CreateExplainableResult,
} from '../../services/explainables/createExplainable.js';
import {
  getOwnExplainable,
  toExplainableDto,
  updateExplainableShare,
} from '../../services/explainables/explainableRepository.js';
import { trashExplainable } from '../../services/explainables/explainableTrash.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { isRowId } from '../../services/trash/ownedRowTrash.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('explainablesContract');
const s = initServer();

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

const NOT_FOUND = { status: 404 as const, body: { error: 'Explainable nicht gefunden.' } };

export interface SourceMessageRow {
  id: string;
  thread_id: string;
  content: string | null;
  tool_results: { citations?: unknown } | null;
}

/** The assistant answer of one of the requester's notebook threads, or null. */
export const SOURCE_MESSAGE_SQL = `SELECT m.id, m.thread_id, m.content, m.tool_results
   FROM chat_messages m
   JOIN chat_threads t ON t.id = m.thread_id
  WHERE m.id = $1
    AND m.role = 'assistant'
    AND m.status = 'complete'
    AND t.user_id = $2
    AND t.thread_type = 'notebook'
    AND t.deleted_at IS NULL`;

/**
 * Persisted citations in either shape — notebook (`index` string,
 * `document_title`, `source_url`) or chat (`id` number, `title`, `url`) —
 * one entry per number.
 */
export function citationsToSources(citations: unknown): ExplainableSource[] {
  if (!Array.isArray(citations)) return [];
  const byIndex = new Map<number, ExplainableSource>();
  for (const raw of citations) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const index = Number(c.index ?? c.id);
    if (!Number.isInteger(index) || index < 1 || byIndex.has(index)) continue;
    const title = [c.document_title, c.title, c.filename].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );
    const url = [c.source_url, c.url].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );
    byIndex.set(index, { index, title: title?.trim() ?? `Quelle ${index}`, url: url ?? null });
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

export interface CreateFromMessageDeps {
  loadMessage: (messageId: string, userId: string) => Promise<SourceMessageRow | null>;
  create: (input: CreateExplainableInput) => Promise<CreateExplainableResult>;
}

const defaultDeps: CreateFromMessageDeps = {
  loadMessage: (messageId, userId) =>
    getPostgresInstance().queryOne<SourceMessageRow>(SOURCE_MESSAGE_SQL, [messageId, userId]),
  create: createExplainable,
};

export async function handleCreateFromMessage(
  userId: string,
  messageId: string,
  locale: 'de-DE' | 'de-AT',
  deps: CreateFromMessageDeps = defaultDeps
) {
  if (!isRowId(messageId)) return NOT_FOUND;
  const message = await deps.loadMessage(messageId, userId);
  const brief = message?.content?.trim();
  if (!message || !brief) return NOT_FOUND;

  const result = await deps.create({
    userId,
    brief,
    sources: citationsToSources(message.tool_results?.citations),
    threadId: message.thread_id,
    sourceMessageId: message.id,
    locale,
  });
  if (result.ok) {
    return {
      status: 201 as const,
      body: { id: result.id, slugSuffix: result.slugSuffix, title: result.title },
    };
  }
  if (result.code === 'budget_exhausted') {
    return { status: 429 as const, body: { error: result.message } };
  }
  if (result.code === 'budget_unavailable') {
    return { status: 503 as const, body: { error: result.message } };
  }
  return { status: 500 as const, body: { error: result.message } };
}

export const explainablesContractRouter = s.router(explainablesContract, {
  createFromMessage: async ({ req, body }) => {
    try {
      const locale = extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE';
      return await handleCreateFromMessage(getUserId(req), body.messageId, locale);
    } catch (error) {
      log.error('[explainables] createFromMessage failed:', (error as Error).message);
      return {
        status: 500 as const,
        body: { error: 'Die Erklärung konnte nicht erstellt werden.' },
      };
    }
  },

  get: async ({ req, params }) => {
    const row = await getOwnExplainable(getUserId(req), params.ref);
    return row ? { status: 200 as const, body: toExplainableDto(row, true) } : NOT_FOUND;
  },

  updateShare: async ({ req, params, body }) => {
    const updated = await updateExplainableShare(
      getUserId(req),
      params.id,
      body.shareMode,
      crypto.randomBytes(16).toString('hex')
    );
    return updated ? { status: 200 as const, body: updated } : NOT_FOUND;
  },

  remove: async ({ req, params }) => {
    const trashed = await trashExplainable(getUserId(req), params.id);
    return trashed ? { status: 200 as const, body: { success: true as const } } : NOT_FOUND;
  },
});

export function mountExplainablesContractRouter(app: Application): void {
  createExpressEndpoints(explainablesContract, explainablesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'explainablesContract'),
  });
}
