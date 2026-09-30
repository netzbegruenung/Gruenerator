/**
 * ts-rest contract router for emoji reactions (/api/auth/reactions).
 *
 * Permission per entity type lives in `services/entityReactions/reactionTargets.ts`;
 * its optional `onChanged` hook runs after a successful change (board comments:
 * live bump for other board viewers). Both routes answer with the entity's fresh summaries. requireAuth is applied
 * at the /api/auth/reactions prefix in routes.ts.
 */
import { entityReactionsContract, type ReactionEntityType } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  addReaction,
  getReactionSummaries,
  removeReaction,
} from '../../../services/entityReactions/EntityReactionsService.js';
import {
  reactionTargets,
  type ReactionAccess,
} from '../../../services/entityReactions/reactionTargets.js';
import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../../utils/getAuthedUser.js';
import { createLogger } from '../../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('entityReactionsContractRouter');

function denied(access: Exclude<ReactionAccess, 'ok'>) {
  return access === 'not_found'
    ? { status: 404 as const, body: { error: 'Nicht gefunden' } }
    : { status: 403 as const, body: { error: 'Kein Zugriff' } };
}

async function summariesFor(type: ReactionEntityType, entityId: string, userId: string) {
  const map = await getReactionSummaries(type, [entityId], userId);
  return { status: 200 as const, body: { reactions: map.get(entityId) ?? [] } };
}

const s = initServer();

export const entityReactionsContractRouter = s.router(entityReactionsContract, {
  addReaction: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { entityType, entityId, emoji } = args.params;
      const target = await reactionTargets[entityType](userId, entityId);
      if (target.access !== 'ok') return denied(target.access);
      await addReaction(userId, entityType, entityId, emoji);
      target.onChanged?.();
      return await summariesFor(entityType, entityId, userId);
    } catch (error) {
      log.error('Error adding reaction', { error });
      return { status: 500 as const, body: { error: 'Reaktion konnte nicht hinzugefügt werden' } };
    }
  },

  removeReaction: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { entityType, entityId, emoji } = args.params;
      const target = await reactionTargets[entityType](userId, entityId);
      if (target.access !== 'ok') return denied(target.access);
      await removeReaction(userId, entityType, entityId, emoji);
      target.onChanged?.();
      return await summariesFor(entityType, entityId, userId);
    } catch (error) {
      log.error('Error removing reaction', { error });
      return { status: 500 as const, body: { error: 'Reaktion konnte nicht entfernt werden' } };
    }
  },
});

export function mountEntityReactionsContractRouter(app: Application): void {
  createExpressEndpoints(entityReactionsContract, entityReactionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'entityReactionsContract'),
  });
}
