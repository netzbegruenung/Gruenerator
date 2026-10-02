/**
 * ts-rest contract for the free-text sharepic creator (experimental).
 *
 * Mount prefix: /api/sharepic-creator
 *
 * The client drives the loop: `draft` returns a spec, the client composes and
 * renders it with the canvas editor's own renderer, and `review` checks the
 * rendered image and answers with patch operations.
 */
import { initContract } from '@ts-rest/core';

import {
  sharepicCreatorErrorSchema,
  sharepicDraftBodySchema,
  sharepicDraftResponseSchema,
  sharepicReviewBodySchema,
  sharepicReviewResponseSchema,
} from '../schemas/sharepicCreator.js';

const c = initContract();

export const sharepicCreatorContract = c.router(
  {
    draft: {
      method: 'POST',
      path: '/api/sharepic-creator/draft',
      body: sharepicDraftBodySchema,
      responses: {
        200: sharepicDraftResponseSchema,
        401: sharepicCreatorErrorSchema,
        502: sharepicCreatorErrorSchema,
      },
      summary: 'Draft a sharepic spec from free text',
    },
    review: {
      method: 'POST',
      path: '/api/sharepic-creator/review',
      body: sharepicReviewBodySchema,
      responses: {
        200: sharepicReviewResponseSchema,
        401: sharepicCreatorErrorSchema,
      },
      summary: 'Check a rendered draft and return patch operations',
    },
  },
  { pathPrefix: '' }
);
