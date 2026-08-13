/**
 * ts-rest contract for the sharepic TEXT generation endpoints.
 *
 * Covers POST /api/sharepic/text/{dreizeilen,zitat,zitat_pure,info,
 * veranstaltung,simple,slider,info_at,dreizeilen_at}.
 *
 * ONE ROUTE PER TYPE, not a single `:type` route with a union response. The
 * body carries no discriminator, so a union would force every caller back into
 * `'mainSlogan' in body` checks — the hand-written unwrapping this contract
 * exists to delete. Nine entries are cheap because the payloads are shared
 * building blocks and the request body is the same for all of them.
 *
 * The two `*_at` routes are the Austrian sujets. They are separate ROUTES and
 * not a locale flag on their German siblings for the same reason: their 200
 * carries different fields (`info_at` answers introline/text/accent), and a
 * route whose shape depends on a header is a union wearing a disguise.
 *
 * NOT here, on purpose:
 * - `POST /api/sharepic/text/default` — different response shape
 *   (`{sharepics, metadata}`) and a different handler. Stays on Express.
 * - The eight deprecated `POST /api/<type>_claude` aliases. Contracting them
 *   would make them look canonical. They stay on Express and serialize through
 *   the same `toSharepicTextWireBody`, so they cannot drift from these routes.
 *
 * Auth and the AI rate limiter hang on the `/api/sharepic/text` prefix in
 * apps/api/routes.ts, BEFORE the mount — `createExpressEndpoints` registers
 * handlers straight onto `app` and inherits no later prefix middleware.
 */
import { initContract } from '@ts-rest/core';

import {
  dreizeilenAtTextResponseSchema,
  dreizeilenTextResponseSchema,
  infoAtTextResponseSchema,
  infoTextResponseSchema,
  sharepicSliderTextBodySchema,
  sharepicTextBodySchema,
  sharepicTextErrorSchema,
  simpleTextResponseSchema,
  sliderTextResponseSchema,
  veranstaltungTextResponseSchema,
  zitatTextResponseSchema,
} from '../schemas/sharepicText.js';

const c = initContract();

const errorResponses = {
  400: sharepicTextErrorSchema,
  500: sharepicTextErrorSchema,
};

export const sharepicTextContract = c.router(
  {
    /** Three-line slogan. */
    generateDreizeilen: {
      method: 'POST',
      path: '/api/sharepic/text/dreizeilen',
      body: sharepicTextBodySchema,
      responses: { 200: dreizeilenTextResponseSchema, ...errorResponses },
      summary: 'Dreizeiler-Text erzeugen',
    },

    /** Quote with attribution frame. */
    generateZitat: {
      method: 'POST',
      path: '/api/sharepic/text/zitat',
      body: sharepicTextBodySchema,
      responses: { 200: zitatTextResponseSchema, ...errorResponses },
      summary: 'Zitat-Text erzeugen',
    },

    /** Quote on a plain background. */
    generateZitatPure: {
      method: 'POST',
      path: '/api/sharepic/text/zitat_pure',
      body: sharepicTextBodySchema,
      responses: { 200: zitatTextResponseSchema, ...errorResponses },
      summary: 'Zitat-Text (pur) erzeugen',
    },

    /** Header + subheader + body prose. */
    generateInfo: {
      method: 'POST',
      path: '/api/sharepic/text/info',
      body: sharepicTextBodySchema,
      responses: { 200: infoTextResponseSchema, ...errorResponses },
      summary: 'Info-Text erzeugen',
    },

    /** Event announcement with date, time and venue. */
    generateVeranstaltung: {
      method: 'POST',
      path: '/api/sharepic/text/veranstaltung',
      body: sharepicTextBodySchema,
      responses: { 200: veranstaltungTextResponseSchema, ...errorResponses },
      summary: 'Veranstaltungs-Text erzeugen',
    },

    /** Headline + subtext. */
    generateSimple: {
      method: 'POST',
      path: '/api/sharepic/text/simple',
      body: sharepicTextBodySchema,
      responses: { 200: simpleTextResponseSchema, ...errorResponses },
      summary: 'Einfachen Sharepic-Text erzeugen',
    },

    /**
     * Österreich: Dreizeiler mit Subline. Eigener Prompt (`dreizeilen_at`), der
     * auf ~15 Zeichen pro Zeile textet statt auf 35 — das AT-Sujet setzt den
     * Slogan grösser.
     */
    generateDreizeilenAt: {
      method: 'POST',
      path: '/api/sharepic/text/dreizeilen_at',
      body: sharepicTextBodySchema,
      responses: { 200: dreizeilenAtTextResponseSchema, ...errorResponses },
      summary: 'Dreizeiler-Text (Österreich) erzeugen',
    },

    /** Österreich: Introline + Satz + gelber Akzent statt Header/Subheader/Body. */
    generateInfoAt: {
      method: 'POST',
      path: '/api/sharepic/text/info_at',
      body: sharepicTextBodySchema,
      responses: { 200: infoAtTextResponseSchema, ...errorResponses },
      summary: 'Info-Text (Österreich) erzeugen',
    },

    /**
     * Slide deck. With `smartCount` the model picks the number of content
     * slides first; the slides then arrive in `alternatives`.
     */
    generateSlider: {
      method: 'POST',
      path: '/api/sharepic/text/slider',
      body: sharepicSliderTextBodySchema,
      responses: { 200: sliderTextResponseSchema, ...errorResponses },
      summary: 'Slider-Deck-Text erzeugen',
    },
  },
  { pathPrefix: '' }
);
