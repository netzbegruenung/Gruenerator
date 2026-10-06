/**
 * Free-text sharepic creator (experimental). The client drives the loop —
 * draft, render with the canvas editor, review, patch — see
 * `packages/contracts/src/contracts/sharepicCreatorContract.ts`.
 */
import { sharepicCreatorContract, type UserProfile } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { DraftFailedError, draftSharepic } from '../../services/sharepicCreator/draftAgent.js';
import { createIllustrationPainter } from '../../services/sharepicCreator/illustrations.js';
import { analyzePhoto, loadOwnPhoto } from '../../services/sharepicCreator/photoAnalysis.js';
import { reviewSharepic } from '../../services/sharepicCreator/review.js';
import { createScenePainter } from '../../services/sharepicCreator/sceneBackground.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('sharepicCreatorContractRouter');

const s = initServer();

export const sharepicCreatorContractRouter = s.router(sharepicCreatorContract, {
  draft: async ({ req, body }) => {
    const user: UserProfile = getAuthedUser(req);
    const locale = body.locale ?? (user.locale === 'de-AT' ? 'de-AT' : 'de-DE');
    try {
      return {
        status: 200 as const,
        body: await draftSharepic(body.prompt, locale, body.current ?? null, body.photos ?? [], {
          scene: createScenePainter(user.id),
          illustrations: createIllustrationPainter(user.id),
        }),
      };
    } catch (err) {
      if (!(err instanceof DraftFailedError)) throw err;
      log.warn(`draft failed: ${err.message}`);
      return {
        status: 502 as const,
        body: {
          error:
            'Der Entwurf ist nicht gelungen. Formuliere den Auftrag etwas genauer und versuch es noch einmal.',
        },
      };
    }
  },
  review: async ({ req, body }) => {
    getAuthedUser(req);
    return { status: 200 as const, body: await reviewSharepic(body.spec, body.prompt, body.image) };
  },
  analyzePhoto: async ({ req, body }) => {
    const user: UserProfile = getAuthedUser(req);
    const { getSharedMediaService } = await import('../share/shareServices.js');
    const image = await loadOwnPhoto(body.url, user.id, await getSharedMediaService());
    if (!image) {
      return { status: 404 as const, body: { error: 'Das Foto wurde nicht gefunden.' } };
    }
    return { status: 200 as const, body: await analyzePhoto(image) };
  },
});

export function mountSharepicCreatorContractRouter(app: Application): void {
  createExpressEndpoints(sharepicCreatorContract, sharepicCreatorContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharepicCreatorContract'),
  });
}
