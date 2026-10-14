/**
 * ts-rest contract for /api/user-library — „Zu meinen Grüneratoren".
 *
 * Add and remove are idempotent PUT/DELETE on the item's address, so a double
 * click or a retry never fails and never duplicates.
 */
import { initContract } from '@ts-rest/core';

import {
  listUserLibraryResponseSchema,
  userLibraryErrorResponseSchema,
  userLibraryItemParamsSchema,
  userLibraryMutationResponseSchema,
} from '../schemas/userLibrary.js';

const c = initContract();

export const userLibraryContract = c.router(
  {
    /** GET /api/user-library — everything the current user added. */
    list: {
      method: 'GET',
      path: '/api/user-library',
      responses: {
        200: listUserLibraryResponseSchema,
        500: userLibraryErrorResponseSchema,
      },
      summary: 'List the agents and recipes the user added to their overview',
    },
    /** PUT /api/user-library/:kind/:ref — add (no-op if already added). */
    add: {
      method: 'PUT',
      path: '/api/user-library/:kind/:ref',
      pathParams: userLibraryItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: userLibraryMutationResponseSchema,
        409: userLibraryErrorResponseSchema,
        500: userLibraryErrorResponseSchema,
      },
      summary: 'Add an agent or recipe to the user overview',
    },
    /** DELETE /api/user-library/:kind/:ref — remove (no-op if not added). */
    remove: {
      method: 'DELETE',
      path: '/api/user-library/:kind/:ref',
      pathParams: userLibraryItemParamsSchema,
      body: c.noBody(),
      responses: {
        200: userLibraryMutationResponseSchema,
        500: userLibraryErrorResponseSchema,
      },
      summary: 'Remove an agent or recipe from the user overview',
    },
  },
  { pathPrefix: '' }
);
