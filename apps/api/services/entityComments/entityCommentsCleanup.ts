/**
 * `entity_comments` and the item reactions in `entity_reactions` are keyed by
 * the marketplace ref, with no FK to the item — nothing removes them when the
 * item goes. Each kind's purge and the account deletion call in here. Reactions
 * on the comments cascade with the comments.
 */
import { type EntityCommentType } from '@gruenerator/contracts';
import { and, eq } from 'drizzle-orm';

import { entityComments, entityReactions } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

/** Purge of one item: its comments and the reactions on the item itself. */
export async function deleteCommentsForEntity(
  entityType: EntityCommentType,
  entityId: string
): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .delete(entityComments)
    .where(and(eq(entityComments.entity_type, entityType), eq(entityComments.entity_id, entityId)));
  await db
    .delete(entityReactions)
    .where(and(eq(entityReactions.item_type, entityType), eq(entityReactions.item_id, entityId)));
}

/**
 * Account deletion: comments and item reactions on every item of the person,
 * trashed ones included — those rows cascade away with the profile. Must run
 * before the profile delete. The person's own comments elsewhere stay, signed
 * „Ehemalige Person" (`user_id` SET NULL); their own reactions cascade.
 */
export async function deleteCommentsOnItemsOfDeletedUser(userId: string): Promise<void> {
  await getPostgresInstance().query(
    `WITH owned_items AS (
       SELECT 'agent' AS item_type, id::text AS item_id FROM user_agents WHERE user_id = $1
       UNION ALL
       SELECT 'recipe', id::text FROM user_text_forms WHERE user_id = $1
       UNION ALL
       SELECT 'template', id::text FROM user_templates WHERE user_id = $1
       UNION ALL
       SELECT 'studio_asset', id::text FROM studio_assets WHERE user_id = $1
     ), comments AS (
       DELETE FROM entity_comments ec USING owned_items oi
        WHERE ec.entity_type = oi.item_type AND ec.entity_id = oi.item_id
     )
     DELETE FROM entity_reactions er USING owned_items oi
      WHERE er.item_type = oi.item_type AND er.item_id = oi.item_id`,
    [userId]
  );
}
