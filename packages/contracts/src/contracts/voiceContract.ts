/**
 * ts-rest contract for voice endpoints.
 *
 * Covers:
 *   apps/api/routes/voice/voiceController.ts — TUS-based transcription,
 *   protokoll, todo-list.
 *
 * Mount prefix: /api/voice
 *
 * Skipped routes (multer/multipart or SSE streaming):
 *   POST /transcribe — multer upload.single('audio')
 *   POST /transcribe-upload/stream — SSE streaming response
 */
import { initContract } from '@ts-rest/core';

import {
  tusTranscribeBodySchema,
  protokollBodySchema,
  todoListBodySchema,
  transcribeResponseSchema,
  protokollResponseSchema,
  todoListResponseSchema,
  voiceErrorResponseSchema,
} from '../schemas/voice.js';

const c = initContract();

export const voiceContract = c.router(
  {
    /**
     * POST /api/voice/transcribe-upload
     * Transcribe a file previously uploaded via TUS at /api/audio/upload.
     * Reads the file from disk by uploadId.
     *
     * @deprecated 2026-10-12, remove after 2026-11-12 — use the SSE route
     * /api/voice/transcribe-upload/stream. Kept for desktop builds that have
     * not auto-updated yet.
     */
    transcribeUpload: {
      method: 'POST',
      path: '/api/voice/transcribe-upload',
      body: tusTranscribeBodySchema,
      responses: {
        200: transcribeResponseSchema,
        400: voiceErrorResponseSchema,
        404: voiceErrorResponseSchema,
        500: voiceErrorResponseSchema,
      },
      summary: 'Transcribe a TUS-uploaded audio/video file',
    },

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
