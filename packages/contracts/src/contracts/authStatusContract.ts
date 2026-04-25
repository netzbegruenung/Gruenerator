/**
 * ts-rest contract for the auth status endpoint.
 *
 *   GET /api/auth/status
 *
 * Reports current session: { isAuthenticated, user } where user is the full
 * canonical UserProfile or null. Always returns 200 — the unauthenticated
 * branch is part of the contract, not an error.
 */
import { initContract } from '@ts-rest/core';

import { authStatusResponseSchema } from '../schemas/authStatus.js';

const c = initContract();

export const authStatusContract = c.router(
  {
    /**
     * GET /api/auth/status
     * Returns the current session state.
     */
    getStatus: {
      method: 'GET',
      path: '/api/auth/status',
      responses: {
        200: authStatusResponseSchema,
      },
      summary: 'Get current auth/session status',
    },
  },
  { pathPrefix: '' }
);
