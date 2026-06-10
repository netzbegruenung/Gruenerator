/**
 * ts-rest contract for the board AI-column flow ("Grünerator-Agent starten").
 *
 * A single fire-and-forget action: enqueue an agent task for a card from the
 * column's AI config. The heavy work (source fetch → AI generation → output nodes)
 * runs asynchronously in boardAgentWorker; the response just returns the task id.
 * Mirrors apps/api/routes/boards/boardAgentContractRouter.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  boardAgentRunBodySchema,
  boardAgentRunResponseSchema,
  boardAgentRunStatusResponseSchema,
  boardAgentErrorResponseSchema,
} from '../schemas/boardFlow.js';

const c = initContract();

export const boardAgentContract = c.router(
  {
    /** POST /api/boards/:boardId/cards/:cardId/agent-run */
    agentRun: {
      method: 'POST',
      path: '/api/boards/:boardId/cards/:cardId/agent-run',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: boardAgentRunBodySchema,
      responses: {
        202: boardAgentRunResponseSchema,
        400: boardAgentErrorResponseSchema,
        401: boardAgentErrorResponseSchema,
        403: boardAgentErrorResponseSchema,
        404: boardAgentErrorResponseSchema,
        500: boardAgentErrorResponseSchema,
      },
      summary: 'Run a board AI-column flow on a card (enqueues an agent task)',
    },

    /** GET /api/boards/:boardId/agent-run/:taskId — poll status + result document */
    agentRunStatus: {
      method: 'GET',
      path: '/api/boards/:boardId/agent-run/:taskId',
      pathParams: z.object({ boardId: z.string(), taskId: z.string() }),
      responses: {
        200: boardAgentRunStatusResponseSchema,
        401: boardAgentErrorResponseSchema,
        403: boardAgentErrorResponseSchema,
        404: boardAgentErrorResponseSchema,
        500: boardAgentErrorResponseSchema,
      },
      summary: 'Poll a board AI-flow task status and its result document',
    },
  },
  { pathPrefix: '' }
);
