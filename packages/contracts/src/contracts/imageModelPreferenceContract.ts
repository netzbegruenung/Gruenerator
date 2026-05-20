import { initContract } from '@ts-rest/core';

import {
  imageModelPreferenceResponseSchema,
  imageModelPreferenceErrorResponseSchema,
  updateImageModelPreferenceBodySchema,
} from '../schemas/imageModelPreference.js';

const c = initContract();

export const imageModelPreferenceContract = c.router(
  {
    getPreference: {
      method: 'GET',
      path: '/api/auth/profile/image-model-preference',
      responses: {
        200: imageModelPreferenceResponseSchema,
        401: imageModelPreferenceErrorResponseSchema,
        500: imageModelPreferenceErrorResponseSchema,
      },
      summary: 'Get the user-default image model',
    },

    updatePreference: {
      method: 'PATCH',
      path: '/api/auth/profile/image-model-preference',
      body: updateImageModelPreferenceBodySchema,
      responses: {
        200: imageModelPreferenceResponseSchema,
        400: imageModelPreferenceErrorResponseSchema,
        401: imageModelPreferenceErrorResponseSchema,
        500: imageModelPreferenceErrorResponseSchema,
      },
      summary: 'Set the user-default image model',
    },
  },
  { pathPrefix: '' }
);
