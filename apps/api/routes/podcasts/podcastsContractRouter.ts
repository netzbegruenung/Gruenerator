/**
 * ts-rest router for podcasts. requireAuth sits at the `/api/podcasts` prefix
 * in routes.ts; `create` additionally behind aiGenerationLimiter +
 * requireAiConsent. The work happens in services/podcasts/podcastWorker.ts.
 */
import { podcastsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { extractLocaleFromRequest } from '../../services/localization/index.js';
import {
  getOwnPodcast,
  insertPodcast,
  podcastVoices,
  requeueFailedPodcast,
} from '../../services/podcasts/podcastRepository.js';
import {
  getTreeBudget,
  treeBudgetSpentMessage,
  treeCostForSpeechSeconds,
} from '../../services/trees/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('podcastsContract');
const s = initServer();

/** The shortest podcast the script prompt asks for, ~2400 characters. */
export const MIN_PODCAST_SECONDS = 160;

const NOT_FOUND = { status: 404 as const, body: { error: 'Podcast nicht gefunden.' } };

function getUser(req: Request): UserProfile {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user;
}

export const podcastsContractRouter = s.router(podcastsContract, {
  create: async ({ req, body }) => {
    const user = getUser(req);
    // Refuse up front when not even a short podcast fits today — otherwise the
    // page would wait for a script only to fail at the first voice. The real
    // booking happens in the worker, against the real seconds.
    const neededUnits = treeCostForSpeechSeconds(MIN_PODCAST_SECONDS);
    const balance = await getTreeBudget().status(user.id);
    if (balance.remainingUnits !== null && balance.remainingUnits < neededUnits) {
      return {
        status: 429 as const,
        body: { error: treeBudgetSpentMessage(balance, neededUnits) },
      };
    }

    const id = await insertPodcast({
      userId: user.id,
      title: body.title?.trim() || 'Podcast',
      sourceText: body.text,
      voices: podcastVoices(user.tts_voice_id),
      locale: extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE',
    });
    log.info(`Podcast ${id} queued`);
    return { status: 202 as const, body: { id } };
  },

  get: async ({ req, params }) => {
    const podcast = await getOwnPodcast(params.id, getUser(req).id);
    return podcast ? { status: 200 as const, body: podcast } : NOT_FOUND;
  },

  retry: async ({ req, params }) => {
    const userId = getUser(req).id;
    if (await requeueFailedPodcast(params.id, userId)) {
      return { status: 202 as const, body: { id: params.id } };
    }
    return (await getOwnPodcast(params.id, userId))
      ? { status: 409 as const, body: { error: 'Der Podcast ist nicht fehlgeschlagen.' } }
      : NOT_FOUND;
  },
});

export function mountPodcastsContractRouter(app: Application): void {
  createExpressEndpoints(podcastsContract, podcastsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'podcastsContract'),
  });
}
