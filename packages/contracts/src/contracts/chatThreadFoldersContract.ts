/**
 * ts-rest contract for /api/chat-service/folders
 *
 * OpenWebUI-style folders that group chat threads. Authenticated — the backend
 * enforces auth + ownership; the contract only models shape.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  folderListResponseSchema,
  folderResponseSchema,
  createFolderBodySchema,
  updateFolderBodySchema,
  successResponseSchema,
  errorResponseSchema,
} from '../schemas/chatThreadFolders.js';

const c = initContract();

export const chatThreadFoldersContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/chat-service/folders',
      responses: {
        200: folderListResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'List the user’s chat thread folders',
    },

    create: {
      method: 'POST',
      path: '/api/chat-service/folders',
      body: createFolderBodySchema,
      responses: {
        201: folderResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Create a chat thread folder',
    },

    update: {
      method: 'PATCH',
      path: '/api/chat-service/folders/:id',
      pathParams: z.object({ id: z.string() }),
      body: updateFolderBodySchema,
      responses: {
        200: folderResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Rename or reorder a folder',
    },

    delete: {
      method: 'DELETE',
      path: '/api/chat-service/folders/:id',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: successResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
      summary: 'Delete a folder (its threads are unfiled, not deleted)',
    },
  },
  { pathPrefix: '' }
);
