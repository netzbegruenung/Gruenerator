/**
 * ts-rest-Vertrag des Chunk-Inspektors (#3123).
 *
 * Beide Endpunkte hängen unter `/api/auth/admin/…`: `requireAuth` greift dort
 * am Präfix (routes.ts), die Admin-Rolle prüft jeder Handler selbst mit
 * `requireInstanceAdmin` — dieselbe Bauform wie agentVisibilityContract.
 *
 * Bewusst NICHT die bestehende Route `GET /api/documents/:id/chunks`: die ist
 * der Lesepfad des Zitat-Panels für angemeldete Nutzer*innen und trägt deren
 * Eigentümerbindung. Zwei Autorisierungen auf einer Route ist die Bauform, aus
 * der Rechteverwechslungen entstehen.
 */
import { initContract } from '@ts-rest/core';

import {
  chunkInspectorErrorSchema,
  inspectDocumentQuerySchema,
  inspectDocumentResponseSchema,
  inspectSearchQuerySchema,
  inspectSearchResponseSchema,
} from '../schemas/chunkInspector.js';

const c = initContract();

export const chunkInspectorContract = c.router(
  {
    /** GET /api/auth/admin/chunk-inspector/:documentId */
    inspectDocument: {
      method: 'GET',
      path: '/api/auth/admin/chunk-inspector/:documentId',
      query: inspectDocumentQuerySchema,
      responses: {
        200: inspectDocumentResponseSchema,
        401: chunkInspectorErrorSchema,
        403: chunkInspectorErrorSchema,
        404: chunkInspectorErrorSchema,
        500: chunkInspectorErrorSchema,
      },
      summary: 'Gespeicherte Chunks eines Dokuments (Admin)',
    },

    /** GET /api/auth/admin/chunk-inspector/:documentId/search */
    inspectSearch: {
      method: 'GET',
      path: '/api/auth/admin/chunk-inspector/:documentId/search',
      query: inspectSearchQuerySchema,
      responses: {
        200: inspectSearchResponseSchema,
        401: chunkInspectorErrorSchema,
        403: chunkInspectorErrorSchema,
        404: chunkInspectorErrorSchema,
        500: chunkInspectorErrorSchema,
      },
      summary: 'Produktions-Suche, Treffer dieses Dokuments markiert (Admin)',
    },
  },
  { pathPrefix: '' }
);
