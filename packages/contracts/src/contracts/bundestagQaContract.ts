/**
 * ts-rest-Vertrag des Bundestag-Q&A: Plan (Kandidaten finden) und Antwort
 * (lesen, belegen, formulieren). Der Dienst ist DE-only — für AT antwortet
 * jeder Endpunkt mit 403. `requireAuth`/`requireAiConsent` greifen am Präfix
 * `/api/bundestag` (routes.ts), das Limit nur auf `/answer`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  bundestagAnswerRequestSchema,
  bundestagAnswerResponseSchema,
  bundestagErrorSchema,
  bundestagPlanRequestSchema,
  bundestagPlanResponseSchema,
} from '../schemas/bundestagQa.js';

const c = initContract();

/**
 * Körper der 429 aus `rateLimitMiddleware` (nicht der des Dienstes): neben
 * `error` trägt er Meldung und Limitstand, die die Middleware ergänzt.
 */
const bundestagRateLimitSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
    requiresLogin: z.boolean().optional(),
  })
  .passthrough();

export const bundestagQaContract = c.router({
  /** POST /api/bundestag/plan */
  plan: {
    method: 'POST',
    path: '/api/bundestag/plan',
    body: bundestagPlanRequestSchema,
    responses: {
      200: bundestagPlanResponseSchema,
      403: bundestagErrorSchema,
    },
    summary: 'Bundestag-Frage: Filter und Kandidaten bestimmen',
  },

  /** POST /api/bundestag/answer */
  answer: {
    method: 'POST',
    path: '/api/bundestag/answer',
    body: bundestagAnswerRequestSchema,
    responses: {
      200: bundestagAnswerResponseSchema,
      403: bundestagErrorSchema,
      429: bundestagRateLimitSchema,
    },
    summary: 'Bundestag-Frage: Dokumente lesen und belegt beantworten',
  },
});
