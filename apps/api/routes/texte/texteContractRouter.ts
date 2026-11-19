/**
 * ts-rest-Router für die Texte-Generatoren mit fester Anfrage/Antwort-Form:
 *   POST /api/texte/alttext   — Alt-Text aus einem Bild
 *   POST /api/texte/alttext/slides — je Seite eines Sharepics ein Alt-Text
 *
 * Löst `routes/texte/alttext.ts` ab. Die dritte
 * Texte-Route (`social`) bleibt Express: sie kann auf SSE umschalten.
 *
 * Authentifizierung/Einwilligung liegen auf dem Präfix `/api/texte` in
 * `routes.ts` — `createExpressEndpoints` registriert direkt auf der App und
 * erbt keine Middleware eines späteren `app.use`-Mounts.
 */
import { texteContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { visionService } from '../../services/vision/index.js';
import { describeSlides } from '../../services/vision/slideAltText.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('texteContract');

const s = initServer();

function userId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

const texteContractRouter = s.router(texteContract, {
  generateAltText: async ({ body, req }) => {
    try {
      // `?? undefined`, nicht `?? null`: der Dienst nimmt den Kontext als
      // optionales Argument, `null` würde dort als gesetzter Wert gelten.
      const altText = await visionService.generateAltText(
        body.imageBase64,
        body.imageDescription ?? undefined
      );
      return { status: 200 as const, body: { altText } };
    } catch (error) {
      log.error('[alttext] Fehler bei der Alt-Text-Erstellung für %s:', userId(req), error);
      return {
        status: 500 as const,
        body: {
          error: 'Fehler bei der Erstellung des Alt-Texts',
          details: (error as Error).message,
        },
      };
    }
  },

  generateSlideAltTexts: async ({ body, req }) => {
    const total = body.slides.length;
    const altTexts = await describeSlides(
      body.slides,
      (slide, i) =>
        visionService.generateSlideAltText(slide.imageBase64, {
          texts: slide.texts,
          index: i + 1,
          total,
        }),
      (i, reason) =>
        log.warn('[alttext/slides] Seite %d/%d für %s:', i + 1, total, userId(req), reason)
    );
    if (altTexts.every((t) => t === null)) {
      return {
        status: 500 as const,
        body: { error: 'Fehler bei der Erstellung der Alt-Texte' },
      };
    }
    return { status: 200 as const, body: { altTexts } };
  },
});

export function mountTexteContractRouter(app: Application): void {
  createExpressEndpoints(texteContract, texteContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'texteContract'),
  });
}
