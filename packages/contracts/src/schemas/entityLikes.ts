/**
 * The keys of polymorphic `entity_likes` rows (F0: persisted as `entity_type`).
 * `agent` and `recipe` are keyed by the ref `user_library_items` stores.
 */
import { z } from 'zod';

export const entityLikeTypeSchema = z.enum([
  'notebook',
  'template',
  'studio_asset',
  'agent',
  'recipe',
]);
export type EntityLikeType = z.infer<typeof entityLikeTypeSchema>;

/**
 * The marketplace item kinds that carry comments and item reactions, keyed
 * like likes: `(entityType, entityId)` with `entityId` = the item's `ref`.
 * F0: persisted in `entity_comments.entity_type` and `entity_reactions.item_type`.
 */
export const entityCommentTypeSchema = entityLikeTypeSchema.exclude(['notebook']);
export type EntityCommentType = z.infer<typeof entityCommentTypeSchema>;
