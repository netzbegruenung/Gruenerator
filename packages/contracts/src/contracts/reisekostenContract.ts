/**
 * ts-rest contract for /api/reisekosten — the Fahrtkosten-Grünerator.
 *
 * Covers belege extraction (OCR + LLM), rule validation (deterministic engine +
 * AI plausibility) and filling the official Landesverband PDF.
 */
import { initContract } from '@ts-rest/core';

import {
  extractBelegBodySchema,
  extractBelegResponseSchema,
  validateBodySchema,
  validateResponseSchema,
  pdfBodySchema,
  pdfResponseSchema,
  reisekostenErrorResponseSchema,
} from '../schemas/reisekosten.js';

const c = initContract();

export const reisekostenContract = c.router(
  {
    /**
     * POST /api/reisekosten/extract-beleg
     * OCR + LLM structured extraction of an uploaded receipt/ticket.
     */
    extractBeleg: {
      method: 'POST',
      path: '/api/reisekosten/extract-beleg',
      body: extractBelegBodySchema,
      responses: {
        200: extractBelegResponseSchema,
        400: reisekostenErrorResponseSchema,
        500: reisekostenErrorResponseSchema,
      },
      summary: 'Extract amount/date/route from an uploaded beleg',
    },

    /**
     * POST /api/reisekosten/validate
     * Deterministic rule checks + AI plausibility against uploaded belege.
     */
    validate: {
      method: 'POST',
      path: '/api/reisekosten/validate',
      body: validateBodySchema,
      responses: {
        200: validateResponseSchema,
        400: reisekostenErrorResponseSchema,
        500: reisekostenErrorResponseSchema,
      },
      summary: 'Validate the form state and return findings + totals',
    },

    /**
     * POST /api/reisekosten/pdf
     * Fill the official PDF template with the (server-recomputed) values.
     */
    pdf: {
      method: 'POST',
      path: '/api/reisekosten/pdf',
      body: pdfBodySchema,
      responses: {
        200: pdfResponseSchema,
        400: reisekostenErrorResponseSchema,
        500: reisekostenErrorResponseSchema,
      },
      summary: 'Generate the filled Reisekosten PDF',
    },
  },
  { pathPrefix: '' },
);
