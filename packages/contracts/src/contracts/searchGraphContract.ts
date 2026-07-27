/**
 * ts-rest contract for /api/search-graph
 *
 * Covers the single POST endpoint in searchGraphContractRouter.ts:
 *   POST /api/search-graph/stream  — Perplexity-style search SSE stream
 *
 * The response is an SSE stream; the contract models the HTTP-level shape
 * (request body validation + status codes). The SSE event payloads are opaque
 * to ts-rest and written by the router directly.
 */
import { initContract } from '@ts-rest/core';

import {
  searchGraphStreamBodySchema,
  searchGraphErrorResponseSchema,
} from '../schemas/searchGraph.js';

const c = initContract();

// SSE endpoint: the response body is streamed manually via res.write(). 200 is
// declared as c.noBody() so ts-rest calls res.status(200).end() instead of
// res.json() after the handler returns — otherwise res.json sets headers on an
// already-ended SSE response. Same reasoning as chatGraphContract.ts.
export const searchGraphContract = c.router(
  {
    /**
     * POST /api/search-graph/stream
     * Run the SearchGraph pipeline and stream sources + answer over SSE.
     */
    stream: {
      method: 'POST',
      path: '/api/search-graph/stream',
      body: searchGraphStreamBodySchema,
      responses: {
        200: c.noBody(),
        400: searchGraphErrorResponseSchema,
        401: searchGraphErrorResponseSchema,
        500: searchGraphErrorResponseSchema,
      },
      summary: 'Stream a SearchGraph answer over SSE',
    },
  },
  { pathPrefix: '' }
);
