/**
 * ts-rest contract for /api/auth/reactions
 *
 * Emoji reactions on group posts, group comments, board comments, marketplace
 * items and their comments. The emoji is a path segment (URL-encoded by
 * ts-rest, decoded by Express). A `marketplace_item` names its kind in the
 * `itemType` query and its ref as `entityId`, the key likes and comments use.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { entityCommentTypeSchema } from '../schemas/entityLikes.js';
import {
  reactionEmojiSchema,
  reactionEntityTypeSchema,
  reactionErrorResponseSchema,
  reactionsResponseSchema,
} from '../schemas/entityReactions.js';

const c = initContract();

const reactionPathParams = z.object({
  entityType: reactionEntityTypeSchema,
  entityId: z.string().min(1).max(200),
  emoji: reactionEmojiSchema,
});

/** Required for `marketplace_item`, ignored for every other entity type. */
const reactionQuery = z.object({ itemType: entityCommentTypeSchema.optional() });

// Removing accepts any emoji: backfilled legacy board reactions (e.g. 💡) must stay removable.
const removeReactionPathParams = reactionPathParams.extend({
  emoji: z.string().min(1).max(32),
});

export const entityReactionsContract = c.router(
  {
    /** PUT /api/auth/reactions/:entityType/:entityId/:emoji — idempotent add. */
    addReaction: {
      method: 'PUT',
      path: '/api/auth/reactions/:entityType/:entityId/:emoji',
      pathParams: reactionPathParams,
      query: reactionQuery,
      body: c.noBody(),
      responses: {
        200: reactionsResponseSchema,
        400: reactionErrorResponseSchema,
        401: reactionErrorResponseSchema,
        403: reactionErrorResponseSchema,
        404: reactionErrorResponseSchema,
        500: reactionErrorResponseSchema,
      },
      summary: 'Add an emoji reaction; returns the updated summaries',
    },

    /** DELETE /api/auth/reactions/:entityType/:entityId/:emoji — idempotent remove. */
    removeReaction: {
      method: 'DELETE',
      path: '/api/auth/reactions/:entityType/:entityId/:emoji',
      pathParams: removeReactionPathParams,
      query: reactionQuery,
      body: c.noBody(),
      responses: {
        200: reactionsResponseSchema,
        400: reactionErrorResponseSchema,
        401: reactionErrorResponseSchema,
        403: reactionErrorResponseSchema,
        404: reactionErrorResponseSchema,
        500: reactionErrorResponseSchema,
      },
      summary: 'Remove an emoji reaction; returns the updated summaries',
    },
  },
  { pathPrefix: '' }
);
