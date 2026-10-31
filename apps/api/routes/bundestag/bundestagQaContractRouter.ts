/**
 * ts-rest-Router des Bundestag-Q&A. Dünne Schicht über der Fassade
 * `services/bundestag/qa`: Locale prüfen, durchreichen. `requireAuth`,
 * `requireAiConsent` und das Limit für `/answer` sitzen am Präfix (routes.ts).
 * Fehler der Fassade werden nicht gefangen — sie laufen in den
 * Fehler-Handler der App (500).
 */
import { bundestagQaContract } from '@gruenerator/contracts';
import { isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  answerBundestagQuestion,
  planBundestagQuestion,
} from '../../services/bundestag/qa/index.js';
import { extractLocaleFromRequest } from '../../services/localization/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('bundestagQaContractRouter');

const s = initServer();

/** Die Quelle ist deutsch (DIP): für AT gibt es keine Antwort, auch keine leere. */
const FORBIDDEN_AT = {
  status: 403 as const,
  body: { error: 'Der Bundestag-Dienst ist nur für Deutschland verfügbar.' },
};

export const bundestagQaContractRouter = s.router(bundestagQaContract, {
  plan: async ({ body, req }) => {
    if (!isIntentAllowedForLocale('bundestag', extractLocaleFromRequest(req))) return FORBIDDEN_AT;
    const plan = await planBundestagQuestion({
      question: body.question,
      ...(body.filters ? { filters: body.filters } : {}),
    });
    return { status: 200 as const, body: plan };
  },

  answer: async ({ body, req }) => {
    if (!isIntentAllowedForLocale('bundestag', extractLocaleFromRequest(req))) return FORBIDDEN_AT;
    const answer = await answerBundestagQuestion({
      question: body.question,
      ...(body.filters ? { filters: body.filters } : {}),
      ...(body.refs ? { refs: body.refs } : {}),
      ...(body.auftrag ? { auftrag: body.auftrag } : {}),
    });
    return { status: 200 as const, body: answer };
  },
});

export function mountBundestagQaContractRouter(app: Application): void {
  createExpressEndpoints(bundestagQaContract, bundestagQaContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'bundestagQaContract'),
  });
}
