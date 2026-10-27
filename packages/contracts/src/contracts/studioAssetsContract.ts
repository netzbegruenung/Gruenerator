/**
 * ts-rest contract for the Studio shop: user-uploaded Sticker and Hintergründe.
 *
 * The image is uploaded first (POST /api/media/upload, uploadSource
 * 'studio-asset'); `create` then turns its share token into a shop item.
 * requireAuth is applied at the /api/studio-assets prefix in routes.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  studioAssetCreateBodySchema,
  studioAssetErrorSchema,
  studioAssetFavoriteResponseSchema,
  studioAssetItemSchema,
  studioAssetLikeResponseSchema,
  studioAssetListQuerySchema,
  studioAssetListResponseSchema,
  studioAssetOfficialBodySchema,
  studioAssetRemoveResponseSchema,
  studioAssetUpdateBodySchema,
} from '../schemas/studioAssets.js';

const c = initContract();

const idParams = z.object({ id: z.string() });

export const studioAssetsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/studio-assets',
      query: studioAssetListQuerySchema,
      responses: {
        200: studioAssetListResponseSchema,
        401: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'List shop, own or saved Sticker/Hintergründe',
    },

    create: {
      method: 'POST',
      path: '/api/studio-assets',
      body: studioAssetCreateBodySchema,
      responses: {
        201: studioAssetItemSchema,
        400: studioAssetErrorSchema,
        401: studioAssetErrorSchema,
        404: studioAssetErrorSchema,
        // Image already backs an asset, or the per-user quota is reached.
        409: studioAssetErrorSchema,
        429: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Create a Sticker/Hintergrund from an uploaded image',
    },

    update: {
      method: 'PATCH',
      path: '/api/studio-assets/:id',
      pathParams: idParams,
      body: studioAssetUpdateBodySchema,
      responses: {
        200: studioAssetItemSchema,
        400: studioAssetErrorSchema,
        401: studioAssetErrorSchema,
        // A removed item cannot be made public again.
        403: studioAssetErrorSchema,
        404: studioAssetErrorSchema,
        429: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Update an own Sticker/Hintergrund',
    },

    official: {
      method: 'PUT',
      path: '/api/studio-assets/:id/official',
      pathParams: idParams,
      body: studioAssetOfficialBodySchema,
      responses: {
        200: studioAssetItemSchema,
        401: studioAssetErrorSchema,
        403: studioAssetErrorSchema,
        // Not found, or not public and unmoderated.
        404: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Instance admins: mark a public Sticker/Hintergrund as official, or unmark it',
    },

    remove: {
      method: 'DELETE',
      path: '/api/studio-assets/:id',
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: studioAssetRemoveResponseSchema,
        401: studioAssetErrorSchema,
        404: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Move an own Sticker/Hintergrund to the Papierkorb',
    },

    like: {
      method: 'PUT',
      path: '/api/studio-assets/:id/like',
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: studioAssetLikeResponseSchema,
        401: studioAssetErrorSchema,
        404: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Like a Sticker/Hintergrund',
    },

    unlike: {
      method: 'DELETE',
      path: '/api/studio-assets/:id/like',
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: studioAssetLikeResponseSchema,
        401: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Remove the like',
    },

    favorite: {
      method: 'PUT',
      path: '/api/studio-assets/:id/favorite',
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: studioAssetFavoriteResponseSchema,
        401: studioAssetErrorSchema,
        404: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Merken: save a Sticker/Hintergrund',
    },

    unfavorite: {
      method: 'DELETE',
      path: '/api/studio-assets/:id/favorite',
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: studioAssetFavoriteResponseSchema,
        401: studioAssetErrorSchema,
        500: studioAssetErrorSchema,
      },
      summary: 'Remove from Gemerkt',
    },
  },
  { pathPrefix: '' }
);
