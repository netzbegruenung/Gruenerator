/**
 * ts-rest contract router for emoji reactions (/api/auth/reactions).
 *
 * Permission per entity type lives in `services/entityReactions/reactionTargets.ts`;
 * its optional `onChanged` hook runs after a successful change (board comments:
 * live bump for other board viewers). Both routes answer with the entity's fresh summaries. requireAuth is applied
 * at the /api/auth/reactions prefix in routes.ts.
 *
 * Marketplace items have no row: `marketplace_item` (with `?itemType=`) and the
 * legacy `agent` resolve to the item key `(itemType, entityId)`.
 */
import {
  type EntityCommentType,
  entityReactionsContract,
  type ReactionEntityType,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  addItemReaction,
  addReaction,
  getItemReactionSummaries,
  getReactionSummaries,
  removeItemReaction,
  removeReaction,
  type RowReactionEntityType,
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

type ReactionKey =
  | { kind: 'row'; type: RowReactionEntityType; id: string }
  | { kind: 'item'; itemType: EntityCommentType; itemId: string };

/** Where the reaction is stored; null when a `marketplace_item` lacks its `itemType`. */
function reactionKey(
  entityType: ReactionEntityType,
  entityId: string,
  itemType: EntityCommentType | null
): ReactionKey | null {
  if (entityType === 'agent') return { kind: 'item', itemType: 'agent', itemId: entityId };
  if (entityType === 'marketplace_item') {
    return itemType ? { kind: 'item', itemType, itemId: entityId } : null;
  }
  return { kind: 'row', type: entityType, id: entityId };
}

async function summariesFor(key: ReactionKey, userId: string) {
  const reactions =
    key.kind === 'item'
      ? (await getItemReactionSummaries(key.itemType, [key.itemId], userId)).get(key.itemId)
      : (await getReactionSummaries(key.type, [key.id], userId)).get(key.id);
  return { status: 200 as const, body: { reactions: reactions ?? [] } };
}

const missingItemType = {
  status: 400 as const,
  body: { error: 'itemType fehlt für marketplace_item' },
};

const s = initServer();

export const entityReactionsContractRouter = s.router(entityReactionsContract, {
  addReaction: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { entityType, entityId, emoji } = args.params;
      const itemType = args.query.itemType ?? null;
      const key = reactionKey(entityType, entityId, itemType);
      if (!key) return missingItemType;
      const target = await reactionTargets[entityType](userId, entityId, itemType);
      if (target.access !== 'ok') return denied(target.access);
      if (key.kind === 'item') await addItemReaction(userId, key.itemType, key.itemId, emoji);
      else await addReaction(userId, key.type, key.id, emoji);
      target.onChanged?.();
      return await summariesFor(key, userId);
    } catch (error) {
      log.error('Error adding reaction', { error });
      return { status: 500 as const, body: { error: 'Reaktion konnte nicht hinzugefügt werden' } };
    }
  },

  removeReaction: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { entityType, entityId, emoji } = args.params;
      const itemType = args.query.itemType ?? null;
      const key = reactionKey(entityType, entityId, itemType);
      if (!key) return missingItemType;
      const target = await reactionTargets[entityType](userId, entityId, itemType);
      if (target.access !== 'ok') return denied(target.access);
      if (key.kind === 'item') await removeItemReaction(userId, key.itemType, key.itemId, emoji);
      else await removeReaction(userId, key.type, key.id, emoji);
      target.onChanged?.();
      return await summariesFor(key, userId);
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
