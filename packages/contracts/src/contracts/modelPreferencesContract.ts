/**
 * ts-rest contract for AI model preferences.
 *
 * Two routes:
 *   - GET   /api/auth/profile/model-preferences
 *   - PATCH /api/auth/profile/model-preferences
 *
 * Both auth-protected (requireAuth at /api/auth/profile in routes.ts).
 */
import { initContract } from '@ts-rest/core';

import {
  modelPreferencesResponseSchema,
  modelPreferencesErrorResponseSchema,
  updateModelPreferenceBodySchema,
} from '../schemas/modelPreferences.js';

const c = initContract();

export const modelPreferencesContract = c.router(
  {
    getPreferences: {
      method: 'GET',
      path: '/api/auth/profile/model-preferences',
      responses: {
        200: modelPreferencesResponseSchema,
        401: modelPreferencesErrorResponseSchema,
        500: modelPreferencesErrorResponseSchema,
      },
      summary: 'Get AI model preferences',
    },

    updatePreference: {
      method: 'PATCH',
      path: '/api/auth/profile/model-preferences',
      body: updateModelPreferenceBodySchema,
      responses: {
        200: modelPreferencesResponseSchema,
        400: modelPreferencesErrorResponseSchema,
        401: modelPreferencesErrorResponseSchema,
        500: modelPreferencesErrorResponseSchema,
      },
      summary: 'Update a single AI model preference',
    },
  },
  { pathPrefix: '' }
);
