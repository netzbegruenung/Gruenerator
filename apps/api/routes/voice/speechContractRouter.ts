/**
 * ts-rest contract router for Grünerator Voice.
 *
 * Covers:
 *   POST /api/voice/speech/generate
 *
 * requireAuth, requireAiConsent and the rate limiter are applied on the
 * /api/voice prefix in routes.ts before this router is mounted —
 * createExpressEndpoints registers handlers straight on the app, so prefix
 * middleware added afterwards would not cover them (routes.mountGuard.vitest.ts).
 */

import { speechContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  SpeechQuotaExceededError,
  generateSpeechFiles,
} from '../../services/voice/speechService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('speechContractRouter');

const s = initServer();

const speechContractRouter = s.router(speechContract, {
  generate: async ({ body, req, res }) => {
    const userId = req.user?.id;
    if (!userId) {
      return { status: 401 as const, body: { success: false as const, error: 'Nicht angemeldet' } };
    }

    // A client that hangs up must not leave us paying for audio nobody
    // receives — the signal reaches every provider request.
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    try {
      const result = await generateSpeechFiles(userId, {
        preset: body.preset,
        text: body.text,
        formats: body.formats,
        // An explicit voice wins; otherwise the person's choice from the settings.
        voiceId: body.voiceId ?? req.user?.tts_voice_id ?? null,
        speed: body.speed ?? null,
        signal: abort.signal,
      });
      return { status: 200 as const, body: { success: true as const, ...result } };
    } catch (error) {
      if (error instanceof SpeechQuotaExceededError) {
        // The message is written for people; the classifier passes it through.
        return {
          status: 429 as const,
          body: { success: false as const, error: toUserFacingMessage(error) },
        };
      }
      if (!abort.signal.aborted) {
        log.error('[Speech] Generate error:', error);
      }
      return {
        status: 500 as const,
        body: { success: false as const, error: toUserFacingMessage(error) },
      };
    }
  },
});

export function mountSpeechContractRouter(app: Application): void {
  createExpressEndpoints(speechContract, speechContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'speechContract'),
  });
}
