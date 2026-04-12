/**
 * ts-rest contract for /api/chat-graph
 *
 * Covers the two POST endpoints in chatGraphController.ts:
 *   POST /api/chat-graph/stream  — main SSE chat stream
 *   POST /api/chat-graph/resume  — resume after clarification interrupt
 *
 * Both responses are SSE streams; the contract models the HTTP-level shape
 * (request body validation + status codes). The actual SSE event payload is
 * opaque to ts-rest and handled by the controller directly.
 */
import { initContract } from '@ts-rest/core';

import {
  chatStreamBodySchema,
  chatResumeBodySchema,
  sseAcceptedResponseSchema,
  chatGraphErrorResponseSchema,
} from '../schemas/chatGraph.js';

const c = initContract();

export const chatGraphContract = c.router(
  {
    /**
     * POST /api/chat-graph/stream
     * Process a chat message using the LangGraph ChatGraph with SSE progress events.
     */
    stream: {
      method: 'POST',
      path: '/api/chat-graph/stream',
      body: chatStreamBodySchema,
      responses: {
        200: sseAcceptedResponseSchema,
        400: chatGraphErrorResponseSchema,
        401: chatGraphErrorResponseSchema,
        500: chatGraphErrorResponseSchema,
      },
      summary: 'Stream a ChatGraph response over SSE',
    },

    /**
     * POST /api/chat-graph/resume
     * Resume a previously interrupted ChatGraph pipeline after the user provides
     * a clarification answer.
     */
    resume: {
      method: 'POST',
      path: '/api/chat-graph/resume',
      body: chatResumeBodySchema,
      responses: {
        200: sseAcceptedResponseSchema,
        400: chatGraphErrorResponseSchema,
        401: chatGraphErrorResponseSchema,
        500: chatGraphErrorResponseSchema,
      },
      summary: 'Resume an interrupted ChatGraph pipeline',
    },
  },
  { pathPrefix: '' }
);
