/**
 * ts-rest-Vertrag für die beiden Texte-Generatoren mit klarer
 * Anfrage/Antwort-Form.
 *
 * Nicht hier drin und mit Absicht: `POST /api/texte/social`. Die Route kann auf
 * `?stream=true` in Server-Sent Events umschalten und schreibt dann direkt in
 * `res` — eine Form, die ts-rest nicht abbildet. Sie bleibt Express, prüft ihren
 * Rumpf aber über `validateBody`.
 *
 * Authentifizierung: `routes.ts` legt `requireAuth` + `requireAiConsent` auf das
 * Präfix `/api/texte`, bevor dieser Router gemountet wird — `createExpressEndpoints`
 * registriert direkt auf der App und erbt keine spätere Mount-Middleware.
 */
import { initContract } from '@ts-rest/core';

import {
  altTextBodySchema,
  altTextResponseSchema,
  websiteGenerateBodySchema,
  websiteGenerateResponseSchema,
  texteErrorSchema,
} from '../schemas/texte.js';

const c = initContract();

export const texteContract = c.router({
  /**
   * POST /api/texte/alttext
   * Alt-Text nach den DBSV-Richtlinien aus einem Bild.
   */
  generateAltText: {
    method: 'POST',
    path: '/api/texte/alttext',
    body: altTextBodySchema,
    responses: {
      200: altTextResponseSchema,
      400: texteErrorSchema,
      401: texteErrorSchema,
      403: texteErrorSchema,
      500: texteErrorSchema,
    },
    summary: 'Alt-Text für ein Bild erzeugen',
  },

  /**
   * POST /api/texte/website
   * Vollständige Landing-Page-Struktur für den Kandidat*innen-Seitenbauer,
   * inklusive der vom Bildwähler ergänzten Bild-URLs.
   */
  generateWebsiteContent: {
    method: 'POST',
    path: '/api/texte/website',
    body: websiteGenerateBodySchema,
    responses: {
      200: websiteGenerateResponseSchema,
      400: texteErrorSchema,
      401: texteErrorSchema,
      403: texteErrorSchema,
      500: texteErrorSchema,
    },
    summary: 'Landing-Page-Inhalte erzeugen',
  },
});
