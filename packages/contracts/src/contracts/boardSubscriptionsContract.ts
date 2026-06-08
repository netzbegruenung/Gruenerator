import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  boardSubscriptionErrorResponseSchema,
  cardSubscriptionStatusSchema,
} from '../schemas/boardSubscriptions.js';

const c = initContract();

export const boardSubscriptionsContract = c.router(
  {
    getSubscription: {
      method: 'GET',
      path: '/api/board-subscriptions/:boardId/cards/:cardId/subscription',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      responses: {
        200: cardSubscriptionStatusSchema,
        401: boardSubscriptionErrorResponseSchema,
        403: boardSubscriptionErrorResponseSchema,
        500: boardSubscriptionErrorResponseSchema,
      },
      summary: 'Whether the current user watches this card + watcher count',
    },
    subscribe: {
      method: 'POST',
      path: '/api/board-subscriptions/:boardId/cards/:cardId/subscription',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: z.object({}),
      responses: {
        200: cardSubscriptionStatusSchema,
        401: boardSubscriptionErrorResponseSchema,
        403: boardSubscriptionErrorResponseSchema,
        500: boardSubscriptionErrorResponseSchema,
      },
      summary: 'Start watching a card',
    },
    unsubscribe: {
      method: 'DELETE',
      path: '/api/board-subscriptions/:boardId/cards/:cardId/subscription',
      pathParams: z.object({ boardId: z.string(), cardId: z.string() }),
      body: z.object({}),
      responses: {
        200: cardSubscriptionStatusSchema,
        401: boardSubscriptionErrorResponseSchema,
        403: boardSubscriptionErrorResponseSchema,
        500: boardSubscriptionErrorResponseSchema,
      },
      summary: 'Stop watching a card',
    },
    // Board-level watch (A9): the whole board, not a single card. Stored in the
    // same table via the sentinel card_id '__board__'.
    getBoardSubscription: {
      method: 'GET',
      path: '/api/board-subscriptions/:boardId/board/subscription',
      pathParams: z.object({ boardId: z.string() }),
      responses: {
        200: cardSubscriptionStatusSchema,
        401: boardSubscriptionErrorResponseSchema,
        403: boardSubscriptionErrorResponseSchema,
        500: boardSubscriptionErrorResponseSchema,
      },
      summary: 'Whether the current user watches this board + watcher count',
    },
    subscribeBoard: {
      method: 'POST',
      path: '/api/board-subscriptions/:boardId/board/subscription',
      pathParams: z.object({ boardId: z.string() }),
      body: z.object({}),
      responses: {
        200: cardSubscriptionStatusSchema,
        401: boardSubscriptionErrorResponseSchema,
        403: boardSubscriptionErrorResponseSchema,
        500: boardSubscriptionErrorResponseSchema,
      },
      summary: 'Start watching a board',
    },
    unsubscribeBoard: {
      method: 'DELETE',
      path: '/api/board-subscriptions/:boardId/board/subscription',
      pathParams: z.object({ boardId: z.string() }),
      body: z.object({}),
      responses: {
        200: cardSubscriptionStatusSchema,
        401: boardSubscriptionErrorResponseSchema,
        403: boardSubscriptionErrorResponseSchema,
        500: boardSubscriptionErrorResponseSchema,
      },
      summary: 'Stop watching a board',
    },
  },
  { pathPrefix: '' }
);
