/**
 * ts-rest contract for the Grünerator-Marktplatz: one list across Agents,
 * Rezepte, Vorlagen, Sticker and Hintergründe, and one like/save model.
 * Reporting stays on /api/content-reports with `item.reportKind`.
 * requireAuth is applied at the /api/marketplace prefix in routes.ts.
 */
import { initContract } from '@ts-rest/core';

import {
  marketplaceErrorSchema,
  marketplaceFrontpageQuerySchema,
  marketplaceFrontpageResponseSchema,
  marketplaceItemParamsSchema,
  marketplaceItemQuerySchema,
  marketplaceItemResponseSchema,
  marketplaceLikeResponseSchema,
  marketplaceListQuerySchema,
  marketplaceListResponseSchema,
  marketplaceSaveResponseSchema,
} from '../schemas/marketplace.js';

const c = initContract();

export const marketplaceContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/marketplace',
      query: marketplaceListQuerySchema,
      responses: {
        200: marketplaceListResponseSchema,
        401: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'One section per requested kind; a single kind pages by offset',
    },

    frontpage: {
      method: 'GET',
      path: '/api/marketplace/frontpage',
      query: marketplaceFrontpageQuerySchema,
      responses: {
        200: marketplaceFrontpageResponseSchema,
        401: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'The front page („Start"): the featured item and the ordered shelves',
    },

    get: {
      method: 'GET',
      path: '/api/marketplace/:kind/:ref',
      pathParams: marketplaceItemParamsSchema,
      query: marketplaceItemQuerySchema,
      responses: {
        200: marketplaceItemResponseSchema,
        401: marketplaceErrorSchema,
        404: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'One item the caller may see, for a shared link',
    },

    like: {
      method: 'PUT',
      path: '/api/marketplace/:kind/:ref/like',
      pathParams: marketplaceItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: marketplaceLikeResponseSchema,
        401: marketplaceErrorSchema,
        404: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'Like a Marktplatz item',
    },

    unlike: {
      method: 'DELETE',
      path: '/api/marketplace/:kind/:ref/like',
      pathParams: marketplaceItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: marketplaceLikeResponseSchema,
        401: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'Remove the like',
    },

    save: {
      method: 'PUT',
      path: '/api/marketplace/:kind/:ref/save',
      pathParams: marketplaceItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: marketplaceSaveResponseSchema,
        401: marketplaceErrorSchema,
        404: marketplaceErrorSchema,
        // „Meine Grüneratoren" is full (USER_LIBRARY_MAX_ITEMS).
        409: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'Save: Agents/Rezepte to „Meine Grüneratoren", everything else to „Gemerkt"',
    },

    unsave: {
      method: 'DELETE',
      path: '/api/marketplace/:kind/:ref/save',
      pathParams: marketplaceItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: marketplaceSaveResponseSchema,
        401: marketplaceErrorSchema,
        500: marketplaceErrorSchema,
      },
      summary: 'Remove from „Meine Grüneratoren" or „Gemerkt"',
    },
  },
  { pathPrefix: '' }
);
