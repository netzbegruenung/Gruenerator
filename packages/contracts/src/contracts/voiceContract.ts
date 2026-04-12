/**
 * ts-rest contract for voice endpoints.
 *
 * Covers:
 *   apps/api/routes/voice/voiceController.ts — TUS-based transcription,
 *   URL transcription, protokoll, speaker identification, todo-list, formats.
 *
 * Mount prefix: /api/voice
 *
 * Skipped routes (multer/multipart or SSE streaming):
 *   POST /transcribe — multer upload.single('audio')
 *   POST /transcribe/stream — multer + SSE streaming
 *   POST /transcribe-upload/stream — SSE streaming response
 *   POST /chat — multer upload.single('audio')
 */
import { initContract } from '@ts-rest/core';

import {
  tusTranscribeBodySchema,
  transcribeUrlBodySchema,
  protokollBodySchema,
  identifySpeakersBodySchema,
  todoListBodySchema,
  transcribeResponseSchema,
  protokollResponseSchema,
  identifySpeakersResponseSchema,
  todoListResponseSchema,
  formatsResponseSchema,
  voiceErrorResponseSchema,
} from '../schemas/voice.js';

const c = initContract();

export const voiceContract = c.router(
  {
    /**
     * POST /api/voice/transcribe-upload
     * Transcribe a file previously uploaded via TUS at /api/audio/upload.
     * Reads the file from disk by uploadId.
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
     * POST /api/voice/transcribe-url
     * Transcribe audio from a URL (Voxtral only).
     */
    transcribeUrl: {
      method: 'POST',
      path: '/api/voice/transcribe-url',
      body: transcribeUrlBodySchema,
      responses: {
        200: transcribeResponseSchema,
        400: voiceErrorResponseSchema,
        500: voiceErrorResponseSchema,
      },
      summary: 'Transcribe audio from a URL',
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
     * POST /api/voice/identify-speakers
     * Use LLM to identify speaker names from diarized transcription.
     */
    identifySpeakers: {
      method: 'POST',
      path: '/api/voice/identify-speakers',
      body: identifySpeakersBodySchema,
      responses: {
        200: identifySpeakersResponseSchema,
        400: voiceErrorResponseSchema,
        500: voiceErrorResponseSchema,
      },
      summary: 'Identify speakers in diarized transcription text',
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

    /**
     * GET /api/voice/formats
     * Get supported audio/video formats.
     */
    getFormats: {
      method: 'GET',
      path: '/api/voice/formats',
      responses: {
        200: formatsResponseSchema,
        500: voiceErrorResponseSchema,
      },
      summary: 'Get supported audio/video formats',
    },
  },
  { pathPrefix: '' }
);
