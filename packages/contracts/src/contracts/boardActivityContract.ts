import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  activityListResponseSchema,
  activitySuccessResponseSchema,
  boardActivityErrorResponseSchema,
  boardActivityRowSchema,
  recordActivityBodySchema,
} from '../schemas/boardActivity.js';

const c = initContract();

export const boardActivityContract = c.router(
  {
    listActivity: {
      method: 'GET',
      path: '/api/board-activity/:boardId/cards/:cardId/activity',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      responses: {
        200: activityListResponseSchema,
        401: boardActivityErrorResponseSchema,
        403: boardActivityErrorResponseSchema,
        500: boardActivityErrorResponseSchema,
      },
      summary: 'List the activity timeline for a card',
    },
    recordActivity: {
      method: 'POST',
      path: '/api/board-activity/:boardId/cards/:cardId/activity',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: recordActivityBodySchema,
      responses: {
        201: boardActivityRowSchema,
        400: boardActivityErrorResponseSchema,
        401: boardActivityErrorResponseSchema,
        403: boardActivityErrorResponseSchema,
        500: boardActivityErrorResponseSchema,
      },
      summary: 'Record a client-side card activity event',
    },
    clearActivity: {
      method: 'DELETE',
      path: '/api/board-activity/:boardId/cards/:cardId/activity',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: z.object({}),
      responses: {
        200: activitySuccessResponseSchema,
        401: boardActivityErrorResponseSchema,
        403: boardActivityErrorResponseSchema,
        500: boardActivityErrorResponseSchema,
      },
      summary: 'Clear a card activity timeline (board owner only)',
    },
  },
  { pathPrefix: '' }
);
