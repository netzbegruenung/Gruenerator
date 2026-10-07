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
  sharepicAnalyzePhotoBodySchema,
  sharepicCreatorErrorSchema,
  sharepicDraftBodySchema,
  sharepicDraftResponseSchema,
  sharepicPhotoAnalysisSchema,
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
      // Two model calls, and for an infographic a FLUX 3 image on top: past the 60s default.
      metadata: { serverTask: true },
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
    analyzePhoto: {
      method: 'POST',
      path: '/api/sharepic-creator/analyze-photo',
      body: sharepicAnalyzePhotoBodySchema,
      responses: {
        200: sharepicPhotoAnalysisSchema,
        401: sharepicCreatorErrorSchema,
        404: sharepicCreatorErrorSchema,
      },
      summary: "Describe one of the user's own media-library photos with vision",
    },
  },
  { pathPrefix: '' }
);
