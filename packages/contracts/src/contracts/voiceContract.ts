/**
 * ts-rest contract for voice endpoints.
 *
 * Covers:
 *   apps/api/routes/voice/voiceContractRouter.ts — protokoll, todo-list.
 *
 * Mount prefix: /api/voice
 *
 * Skipped routes (multer/multipart or SSE streaming):
 *   POST /transcribe — multer upload.single('audio')
 *   POST /transcribe-upload/stream — SSE streaming response
 */
import { initContract } from '@ts-rest/core';

import {
  protokollBodySchema,
  todoListBodySchema,
  protokollResponseSchema,
  todoListResponseSchema,
  voiceErrorResponseSchema,
} from '../schemas/voice.js';

const c = initContract();

export const voiceContract = c.router(
  {
    /**
     * POST /api/voice/protokoll
     * Generate a structured protocol from transcription text.
     */
    protokoll: {
      method: 'POST',
      path: '/api/voice/protokoll',
      body: protokollBodySchema,
      responses: {
        200: protokollResponseSchema,
        400: voiceErrorResponseSchema,
        500: voiceErrorResponseSchema,
      },
      summary: 'Generate a protocol from transcription text',
    },

    /**
     * POST /api/voice/todo-list
     * Extract action items from transcription text as checklist HTML.
     */
    todoList: {
      method: 'POST',
      path: '/api/voice/todo-list',
      body: todoListBodySchema,
      responses: {
        200: todoListResponseSchema,
        400: voiceErrorResponseSchema,
        500: voiceErrorResponseSchema,
      },
      summary: 'Extract action items from transcription text',
    },
  },
  { pathPrefix: '' }
);
