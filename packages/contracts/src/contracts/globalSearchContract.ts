/**
 * Unified "search everything" over the caller's own content. Distinct from
 * `searchContract` (`/api/search`), which is web search.
 */
import { initContract } from '@ts-rest/core';

import {
  globalSearchErrorResponseSchema,
  globalSearchQuerySchema,
  globalSearchResponseSchema,
  officeSearchResponseSchema,
} from '../schemas/globalSearch.js';

const c = initContract();

export const globalSearchContract = c.router(
  {
    search: {
      method: 'GET',
      path: '/api/global-search',
      query: globalSearchQuerySchema,
      responses: {
        200: globalSearchResponseSchema,
        401: globalSearchErrorResponseSchema,
        500: globalSearchErrorResponseSchema,
      },
      summary: 'Search all user content in one request',
    },
    officeSearch: {
      method: 'GET',
      path: '/api/global-search/office',
      query: globalSearchQuerySchema,
      responses: {
        200: officeSearchResponseSchema,
        401: globalSearchErrorResponseSchema,
        500: globalSearchErrorResponseSchema,
      },
      summary:
        'Search the caller’s office content (docs, boards, sheets, presentations) by title or body',
    },
  },
  { pathPrefix: '' }
);
