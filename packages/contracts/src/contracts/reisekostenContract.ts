/**
 * ts-rest contract for /api/reisekosten — the Reisekosten-Grünerator.
 *
 * The server never sees bank details, address or phone, and never the belege
 * files of text PDFs: the browser computes, fills the official form and merges
 * the attachments. The server stores the rest of a draft, hands out the blank
 * form, and reads belege the browser could not read itself.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  abrechnungCreateBodySchema,
  abrechnungListResponseSchema,
  abrechnungSchema,
  abrechnungUpdateBodySchema,
  extractBelegBodySchema,
  extractBelegResponseSchema,
  formularResponseSchema,
  rateKeySchema,
  reisekostenErrorResponseSchema,
} from '../schemas/reisekosten.js';

const c = initContract();

const idOrSlugParams = z.object({ idOrSlug: z.string().min(1) });

export const reisekostenContract = c.router(
  {
    /**
     * POST /api/reisekosten/extract-beleg
     * Classify a beleg and extract amount/date/route — from its text, or (scans
     * and photos) from the file via OCR.
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
      summary: 'Classify a beleg and extract amount/date/route',
    },

    /** GET /api/reisekosten/formular/:rateKey — blank official form + field map. */
    formular: {
      method: 'GET',
      path: '/api/reisekosten/formular/:rateKey',
      pathParams: z.object({ rateKey: rateKeySchema }),
      responses: {
        200: formularResponseSchema,
        503: reisekostenErrorResponseSchema,
      },
      summary: 'Blank official Reisekosten form and its field map',
    },

    listAbrechnungen: {
      method: 'GET',
      path: '/api/reisekosten/abrechnungen',
      responses: { 200: abrechnungListResponseSchema },
      summary: "List the user's saved Abrechnungen",
    },

    getAbrechnung: {
      method: 'GET',
      path: '/api/reisekosten/abrechnungen/:idOrSlug',
      pathParams: idOrSlugParams,
      responses: { 200: abrechnungSchema, 404: reisekostenErrorResponseSchema },
      summary: 'Get one Abrechnung by slug or id',
    },

    createAbrechnung: {
      method: 'POST',
      path: '/api/reisekosten/abrechnungen',
      body: abrechnungCreateBodySchema,
      responses: { 201: abrechnungSchema },
      summary: 'Create a draft Abrechnung',
    },

    updateAbrechnung: {
      method: 'PATCH',
      path: '/api/reisekosten/abrechnungen/:idOrSlug',
      pathParams: idOrSlugParams,
      body: abrechnungUpdateBodySchema,
      responses: { 200: abrechnungSchema, 404: reisekostenErrorResponseSchema },
      summary: 'Update state, belege metadata or status of an Abrechnung',
    },

    deleteAbrechnung: {
      method: 'DELETE',
      path: '/api/reisekosten/abrechnungen/:idOrSlug',
      pathParams: idOrSlugParams,
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        404: reisekostenErrorResponseSchema,
      },
      summary: 'Move an Abrechnung to the Papierkorb',
    },
  },
  { pathPrefix: '' }
);
