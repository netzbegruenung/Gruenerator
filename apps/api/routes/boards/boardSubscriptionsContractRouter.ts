/**
 * ts-rest contract router for /api/board-subscriptions
 *
 * Card watchers. A subscriber receives notifications about a card without being
 * an assignee. Mount via mountBoardSubscriptionsContractRouter(app) after requireAuth.
 */

import { boardSubscriptionsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  countBoardSubscribers,
  isBoardSubscribed,
  subscribeToBoard,
  unsubscribeFromBoard,
} from '../../services/boards/boardSubscriptionService.js';
import {
  countSubscribers,
  isSubscribed,
  subscribeToCard,
  unsubscribeFromCard,
} from '../../services/boards/cardSubscriptionService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { checkBoardAccess } from './boardAccess.js';

import type { Application } from 'express';

const log = createLogger('boardSubscriptionsContract');

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const s = initServer();

export const boardSubscriptionsContractRouter = s.router(boardSubscriptionsContract, {
  getSubscription: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const [subscribed, count] = await Promise.all([
        isSubscribed(boardId, cardId, userId),
        countSubscribers(boardId, cardId),
      ]);
      return { status: 200 as const, body: { subscribed, count } };
    } catch (error) {
      log.error('Error reading subscription', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Abo konnte nicht geladen werden' } };
    }
  },

  subscribe: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      await subscribeToCard(boardId, cardId, userId);
      const count = await countSubscribers(boardId, cardId);
      return { status: 200 as const, body: { subscribed: true, count } };
    } catch (error) {
      log.error('Error subscribing', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Abo fehlgeschlagen' } };
    }
  },

  unsubscribe: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId, cardId } = args.params;

      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      await unsubscribeFromCard(boardId, cardId, userId);
      const count = await countSubscribers(boardId, cardId);
      return { status: 200 as const, body: { subscribed: false, count } };
    } catch (error) {
      log.error('Error unsubscribing', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Abbestellen fehlgeschlagen' } };
    }
  },

  // ── Board-level watch (board_subscriptions table) ─────────────────────────
  getBoardSubscription: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      const [subscribed, count] = await Promise.all([
        isBoardSubscribed(boardId, userId),
        countBoardSubscribers(boardId),
      ]);
      return { status: 200 as const, body: { subscribed, count } };
    } catch (error) {
      log.error('Error reading board subscription', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Abo konnte nicht geladen werden' } };
    }
  },

  subscribeBoard: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      await subscribeToBoard(boardId, userId);
      const count = await countBoardSubscribers(boardId);
      return { status: 200 as const, body: { subscribed: true, count } };
    } catch (error) {
      log.error('Error subscribing to board', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Abo fehlgeschlagen' } };
    }
  },

  unsubscribeBoard: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { boardId } = args.params;
      const { hasAccess } = await checkBoardAccess(boardId, userId);
      if (!hasAccess) return { status: 403 as const, body: { error: 'Kein Zugriff' } };

      await unsubscribeFromBoard(boardId, userId);
      const count = await countBoardSubscribers(boardId);
      return { status: 200 as const, body: { subscribed: false, count } };
    } catch (error) {
      log.error('Error unsubscribing from board', { error: errMsg(error) });
      return { status: 500 as const, body: { error: 'Abbestellen fehlgeschlagen' } };
    }
  },
});

export function mountBoardSubscriptionsContractRouter(app: Application): void {
  createExpressEndpoints(boardSubscriptionsContract, boardSubscriptionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'boardSubscriptionsContract'),
  });
}
