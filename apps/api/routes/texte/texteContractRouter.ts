/**
 * ts-rest-Router für die Texte-Generatoren mit fester Anfrage/Antwort-Form:
 *   POST /api/texte/alttext   — Alt-Text aus einem Bild
 *   POST /api/texte/website   — Landing-Page-Inhalte für den Seitenbauer
 *
 * Löst `routes/texte/alttext.ts` und `routes/texte/website.ts` ab. Die dritte
 * Texte-Route (`social`) bleibt Express: sie kann auf SSE umschalten.
 *
 * Authentifizierung/Einwilligung liegen auf dem Präfix `/api/texte` in
 * `routes.ts` — `createExpressEndpoints` registriert direkt auf der App und
 * erbt keine Middleware eines späteren `app.use`-Mounts.
 */
import { texteContract, websiteContentSchema } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import imagePickerService from '../../services/image/ImageSelectionService.js';
import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../services/localization/index.js';
import { visionService } from '../../services/vision/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { attachImages, clampSections, parseModelJson } from './websiteContent.js';
import { buildWebsiteSystemPrompt } from './websitePrompt.js';

import type { AiClient } from '../../services/ai/types.js';
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

  generateWebsiteContent: async ({ body, req, res }) => {
    try {
      const systemPrompt = localizePlaceholders(
        buildWebsiteSystemPrompt(body.email),
        extractLocaleFromRequest(req)
      );

      // Kein `provider` auf oberster Ebene: das wählt den Adapter, ohne das
      // Modell mitzuwählen — genau so schickte diese Route einmal einen
      // verdigado-Alias an die Mistral-API. `type: 'website'` wählt beides.
      const aiClient = res.app.locals.aiClient as AiClient;
      const result = await aiClient.processRequest(
        {
          type: 'website',
          systemPrompt,
          messages: [
            {
              role: 'user' as const,
              content: `Erstelle eine professionelle Landing-Page für folgende Person:\n\n${body.description}`,
            },
          ],
          options: { temperature: 0.7 },
        },
        req
      );

      if (!result.success) {
        log.error('[website] AI-Worker meldet Fehler: %s', result.error);
        return {
          status: 500 as const,
          body: {
            error: 'Fehler bei der Erstellung der Website-Inhalte',
            details: result.error ?? 'Unbekannter Fehler',
          },
        };
      }

      let raw: unknown;
      try {
        raw = parseModelJson(result.content ?? '');
      } catch (parseError) {
        log.error('[website] JSON nicht lesbar: %s', (parseError as Error).message);
        log.debug('[website] Rohantwort: %s', (result.content ?? '').slice(0, 500));
        return {
          status: 500 as const,
          body: {
            error: 'Fehler bei der Erstellung der Website-Inhalte',
            details: 'Die KI hat kein valides JSON generiert. Bitte versuche es erneut.',
          },
        };
      }

      // Das Schema ist die Prüfung. Vorher sah die Route nur nach, ob die sechs
      // Schlüssel überhaupt da waren — eine halb gefüllte Antwort ging als
      // Erfolg durch und fiel erst im Seitenbauer auf.
      const parsed = websiteContentSchema.safeParse(raw);
      if (!parsed.success) {
        log.error('[website] Antwort passt nicht zum Schema: %s', parsed.error.message);
        return {
          status: 500 as const,
          body: {
            error: 'Fehler bei der Erstellung der Website-Inhalte',
            details: 'Die KI-Antwort war unvollständig. Bitte versuche es erneut.',
          },
        };
      }

      const withImages = await attachImages(clampSections(parsed.data), async (text) => {
        try {
          const picked = await imagePickerService.selectBestImage(
            text,
            aiClient,
            { maxCandidates: 5 },
            req
          );
          return `/api/image-picker/stock-image/${picked.selectedImage.filename}`;
        } catch (err) {
          log.warn('[website] Bildwahl fehlgeschlagen: %s', (err as Error).message);
          return '';
        }
      });

      return {
        status: 200 as const,
        body: {
          json: withImages,
          ...(result.metadata ? { metadata: result.metadata as Record<string, unknown> } : {}),
        },
      };
    } catch (error) {
      log.error('[website] Fehler für %s:', userId(req), error);
      return {
        status: 500 as const,
        body: {
          error: 'Fehler bei der Erstellung der Website-Inhalte',
          details: (error as Error).message,
        },
      };
    }
  },
});

export function mountTexteContractRouter(app: Application): void {
  createExpressEndpoints(texteContract, texteContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'texteContract'),
  });
}
