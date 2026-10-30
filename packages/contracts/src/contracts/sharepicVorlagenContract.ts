/**
 * ts-rest contract for the Grünerator-Vorlagen catalogue of sharepics.
 *
 * Mount prefix: /api/sharepic-vorlagen
 *
 * The thumbnails (`GET /api/sharepic-vorlagen/:id/thumb` and
 * `/seiten/:id/thumb`) are binary and stay plain Express routes next to this one.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  canvasVorlagenListResponseSchema,
  folienVorlagenListResponseSchema,
  printVorlagenListResponseSchema,
  sharepicBloeckeListResponseSchema,
  sharepicSeitenListResponseSchema,
  sharepicVorlageIdSchema,
  sharepicVorlageSchema,
  sharepicVorlagenErrorSchema,
  sharepicVorlagenListResponseSchema,
  vorlagenLandQuerySchema,
} from '../schemas/sharepicVorlagen.js';

const c = initContract();

export const sharepicVorlagenContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/sharepic-vorlagen',
      query: vorlagenLandQuerySchema,
      responses: {
        200: sharepicVorlagenListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary:
        "The Vorlagen of the viewer's country, detected from the profile; instance admins may pick the other with `land`",
    },
    // Before `get`: `seiten` is also a valid Vorlage id, and the first route wins.
    seiten: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/seiten',
      query: vorlagenLandQuerySchema,
      responses: {
        200: sharepicSeitenListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary: "Single slides to add to a carousel, in the viewer's country like `list`",
    },
    // Before `get` as well, for the same reason.
    folien: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/folien',
      query: vorlagenLandQuerySchema,
      responses: {
        200: folienVorlagenListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary: "Slide deck styles for chat presentations, in the viewer's country like `list`",
    },
    // Before `get` as well, for the same reason.
    canvas: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/canvas',
      query: vorlagenLandQuerySchema,
      responses: {
        200: canvasVorlagenListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary:
        "Vorlagen saved as editor pages, for every format (sticker, Profilbild, print …), in the viewer's country like `list`",
    },
    // Before `get` as well, for the same reason.
    print: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/print',
      query: vorlagenLandQuerySchema,
      responses: {
        200: printVorlagenListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary: "Print Vorlagen (business cards, posters) in the viewer's country like `list`",
    },
    // Before `get` as well, for the same reason.
    bloecke: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/bloecke',
      query: vorlagenLandQuerySchema,
      responses: {
        200: sharepicBloeckeListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary:
        "Building blocks (a list on its card, a quote …) the editor drops onto a page, in the viewer's country like `list`",
    },
    get: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/:id',
      pathParams: z.object({ id: sharepicVorlageIdSchema }),
      responses: {
        200: sharepicVorlageSchema,
        401: sharepicVorlagenErrorSchema,
        404: sharepicVorlagenErrorSchema,
      },
      summary: 'One Vorlage, to compose and copy into a new canvas',
    },
  },
  { pathPrefix: '' }
);
