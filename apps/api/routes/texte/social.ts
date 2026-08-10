/**
 * `POST /api/texte/social` — Social-Media-Beiträge aus Thema, Details und
 * Plattformwahl.
 *
 * Bewusst kein ts-rest-Vertrag: die Route schaltet auf `?stream=true` bzw.
 * `Accept: text/event-stream` in Server-Sent Events um und schreibt dann direkt
 * in `res`. Diese Form bildet ts-rest nicht ab. Der Rumpf wird stattdessen über
 * `validateBody` geprüft — vorher ging er ungeprüft in den Graphen.
 *
 * Anmeldung und Art.-9-Einwilligung liegen auf dem Präfix in `routes.ts`.
 */
import { type Router, type Response } from 'express';
import express from 'express';
import { z } from 'zod';

import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('texte/social');
const router: Router = express.Router();

/**
 * `passthrough`, weil der PromptProcessor über die vier Pflichtfelder hinaus
 * eine Reihe optionaler Steuerfelder liest (customPrompt, knowledgeContent,
 * selectedDocumentIds …), die alle Generatoren teilen. Ein geschlossenes Schema
 * hier würde sie stillschweigend verwerfen.
 */
const socialSchema = z
  .object({
    thema: z.string().min(1, 'Bitte gib ein Thema an'),
    details: z.string().optional(),
    platforms: z.array(z.string()).min(1, 'Bitte wähle mindestens eine Plattform'),
    includeActionIdeas: z.boolean().optional(),
  })
  .passthrough();
type SocialBody = z.infer<typeof socialSchema>;

router.post(
  '/',
  validateBody(socialSchema),
  async (req: TypedRequest<SocialBody>, res: Response): Promise<void> => {
    log.debug('[texte/social] Anfrage für %s', req.user?.id ?? 'unbekannt');
    if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
      return processGraphRequestStreaming('social', req, res);
    }
    await processGraphRequest('social', req, res);
  }
);

export default router;
