/**
 * ts-rest contract router for the board AI-column flow ("Grünerator-Agent starten").
 *
 * Enqueues an agent task from a card's AI-column config; the heavy work runs in
 * boardAgentWorker → runFlow. Mount via mountBoardAgentContractRouter(app) under the
 * already-authed /api/boards prefix in routes.ts.
 */
import { boardAgentContract, type BoardFlowConfig } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { enqueueAgentTask, flowTaskText } from '../../services/boards/agentTaskService.js';
import { isConfigured as isApifyConfigured } from '../../services/monitor/ApifyService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardAgentContract');
const db = getPostgresInstance();

const s = initServer();

export const boardAgentContractRouter = s.router(boardAgentContract, {
  agentRun: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;
      const { flow, cardContext } = args.body;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      // Guard the one source that needs external config; fail fast with a clear
      // message instead of letting the worker discover it asynchronously.
      if (flow.source.type === 'apify_social' && !isApifyConfigured()) {
        return {
          status: 400 as const,
          body: { error: 'Social-Media-Recherche ist nicht konfiguriert (APIFY_TOKEN fehlt).' },
        };
      }

      const localeRows = await db.query<{ locale: string }>(
        `SELECT locale FROM profiles WHERE id = $1`,
        [userId]
      );

      const flowConfig: BoardFlowConfig = { ...flow, cardContext };
      const taskText = flowTaskText(flow);

      const task = await enqueueAgentTask({
        boardId,
        cardId,
        triggerCommentId: null,
        requestedBy: userId,
        taskText,
        locale: localeRows[0]?.locale ?? 'de-DE',
        flowConfig,
      });

      return { status: 202 as const, body: { taskId: task.id } };
    } catch (error) {
      log.error('Error starting board agent flow', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Agent konnte nicht gestartet werden' } };
    }
  },

  agentRunStatus: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, taskId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const rows = await db.query<{
        status: 'pending' | 'running' | 'completed' | 'failed';
        result_document_id: string | null;
      }>(`SELECT status, result_document_id FROM agent_tasks WHERE id = $1 AND board_id = $2`, [
        taskId,
        boardId,
      ]);
      if (rows.length === 0)
        return { status: 404 as const, body: { error: 'Aufgabe nicht gefunden' } };

      const { status, result_document_id } = rows[0];
      let documentTitle: string | null = null;
      if (result_document_id) {
        const docRows = await db.query<{ title: string }>(
          `SELECT title FROM collaborative_documents WHERE id = $1`,
          [result_document_id]
        );
        documentTitle = docRows[0]?.title ?? null;
      }

      return {
        status: 200 as const,
        body: { status, documentId: result_document_id, documentTitle },
      };
    } catch (error) {
      log.error('Error polling board agent flow status', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Status konnte nicht geladen werden' } };
    }
  },
});

export function mountBoardAgentContractRouter(app: Application): void {
  createExpressEndpoints(boardAgentContract, boardAgentContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardAgentContract'),
  });
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
