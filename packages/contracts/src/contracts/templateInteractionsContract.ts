/**
 * ts-rest contract for template (Vorlagen) likes & favorites.
 *
 * Mounted under /api/auth/templates. These interactions apply to ANY gallery
 * template (system templates, system files, published user vorlagen), so they
 * are keyed on the gallery item id rather than the user_templates PK.
 *
 * All routes require authentication — requireAuth is applied at the
 * /api/auth/templates prefix in routes.ts before this contract is mounted.
 *
 * Declaration order matters: the literal-segment paths (/likes, /favorites)
 * must appear BEFORE the parameterised /:id/* paths so ts-rest's Express
 * matcher resolves them first.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  templateInteractionErrorSchema,
  listMyLikedTemplatesResponseSchema,
  likeTemplateResponseSchema,
  unlikeTemplateResponseSchema,
  listMyFavoriteTemplatesResponseSchema,
  favoriteTemplateResponseSchema,
  unfavoriteTemplateResponseSchema,
} from '../schemas/templateInteractions.js';

const c = initContract();

export const templateInteractionsContract = c.router(
  {
    /** GET /api/auth/templates/likes — IDs of templates the user has liked. */
    listMyLikedTemplates: {
      method: 'GET',
      path: '/api/auth/templates/likes',
      responses: {
        200: listMyLikedTemplatesResponseSchema,
        401: templateInteractionErrorSchema,
        500: templateInteractionErrorSchema,
      },
      summary: "List the authenticated user's liked template IDs",
    },

    /** GET /api/auth/templates/favorites — the user's favorited templates (full objects). */
    listMyFavoriteTemplates: {
      method: 'GET',
      path: '/api/auth/templates/favorites',
      responses: {
        200: listMyFavoriteTemplatesResponseSchema,
        401: templateInteractionErrorSchema,
        500: templateInteractionErrorSchema,
      },
      summary: "List the authenticated user's favorited templates",
    },

    /** POST /api/auth/templates/:id/like — like a template (idempotent). */
    likeTemplate: {
      method: 'POST',
      path: '/api/auth/templates/:id/like',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: likeTemplateResponseSchema,
        401: templateInteractionErrorSchema,
        500: templateInteractionErrorSchema,
      },
      summary: 'Like a template',
    },

    /** DELETE /api/auth/templates/:id/like — remove the user's like. */
    unlikeTemplate: {
      method: 'DELETE',
      path: '/api/auth/templates/:id/like',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: unlikeTemplateResponseSchema,
        401: templateInteractionErrorSchema,
        500: templateInteractionErrorSchema,
      },
      summary: 'Unlike a template',
    },

    /** POST /api/auth/templates/:id/favorite — bookmark a template (idempotent). */
    favoriteTemplate: {
      method: 'POST',
      path: '/api/auth/templates/:id/favorite',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: favoriteTemplateResponseSchema,
        401: templateInteractionErrorSchema,
        500: templateInteractionErrorSchema,
      },
      summary: 'Favorite a template',
    },

    /** DELETE /api/auth/templates/:id/favorite — remove the bookmark. */
    unfavoriteTemplate: {
      method: 'DELETE',
      path: '/api/auth/templates/:id/favorite',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: unfavoriteTemplateResponseSchema,
        401: templateInteractionErrorSchema,
        500: templateInteractionErrorSchema,
      },
      summary: 'Unfavorite a template',
    },
  },
  { pathPrefix: '' }
);
