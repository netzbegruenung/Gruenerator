/**
 * Emoji-Reaktionen auf Beiträge und Kommentare (`entity_reactions`).
 *
 * Polymorph wie `entity_likes`: kein FK auf `entity_id`, jede Löschstelle der
 * Entität ruft `deleteReactionsForEntities`. Wer reagieren darf, entscheidet
 * `reactionTargets.ts` — dieser Dienst prüft keine Rechte.
 */
import {
  REACTION_EMOJIS,
  type ReactionEntityType,
  type ReactionSummary,
} from '@gruenerator/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { entityReactions, type EntityReactionRow } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

export async function addReaction(
  userId: string,
  entityType: ReactionEntityType,
  entityId: string,
  emoji: string
): Promise<EntityReactionRow | null> {
  const rows = await getDrizzleInstance()
    .insert(entityReactions)
    .values({ user_id: userId, entity_type: entityType, entity_id: entityId, emoji })
    .onConflictDoNothing({
      target: [
        entityReactions.entity_type,
        entityReactions.entity_id,
        entityReactions.user_id,
        entityReactions.emoji,
      ],
    })
    .returning();
  return rows[0] ?? null;
}

export async function removeReaction(
  userId: string,
  entityType: ReactionEntityType,
  entityId: string,
  emoji: string
): Promise<void> {
  await getDrizzleInstance()
    .delete(entityReactions)
    .where(
      and(
        eq(entityReactions.user_id, userId),
        eq(entityReactions.entity_type, entityType),
        eq(entityReactions.entity_id, entityId),
        eq(entityReactions.emoji, emoji)
      )
    );
}

export interface ReactionAggregateRow {
  entity_id: string;
  emoji: string;
  count: number;
  reacted: boolean;
  first_at: Date | string;
}

function emojiRank(emoji: string): number {
  const index = (REACTION_EMOJIS as readonly string[]).indexOf(emoji);
  return index === -1 ? REACTION_EMOJIS.length : index;
}

/** Gruppiert je Entität; Reihenfolge: erstes Auftreten, dann Emoji-Reihenfolge (fremde zuletzt). */
export function toReactionSummaries(rows: ReactionAggregateRow[]): Map<string, ReactionSummary[]> {
  const sorted = rows
    .map((r) => ({ ...r, firstMs: new Date(r.first_at).getTime() }))
    .sort(
      (a, b) =>
        a.firstMs - b.firstMs ||
        emojiRank(a.emoji) - emojiRank(b.emoji) ||
        a.emoji.localeCompare(b.emoji)
    );
  const result = new Map<string, ReactionSummary[]>();
  for (const r of sorted) {
    const list = result.get(r.entity_id) ?? [];
    list.push({ emoji: r.emoji, count: r.count, reacted: r.reacted });
    result.set(r.entity_id, list);
  }
  return result;
}

/** Ein Query für alle ids; Entitäten ohne Reaktion fehlen in der Map. */
export async function getReactionSummaries(
  entityType: ReactionEntityType,
  entityIds: string[],
  viewerId: string
): Promise<Map<string, ReactionSummary[]>> {
  if (entityIds.length === 0) return new Map();
  const rows = await getDrizzleInstance()
    .select({
      entity_id: entityReactions.entity_id,
      emoji: entityReactions.emoji,
      count: sql<number>`count(*)::int`,
      reacted: sql<boolean>`bool_or(${entityReactions.user_id} = ${viewerId})`,
      first_at: sql<Date | string>`min(${entityReactions.created_at})`,
    })
    .from(entityReactions)
    .where(
      and(
        eq(entityReactions.entity_type, entityType),
        inArray(entityReactions.entity_id, entityIds)
      )
    )
    .groupBy(entityReactions.entity_id, entityReactions.emoji);
  return toReactionSummaries(rows);
}

/** Rohe Zeilen für alle ids in einem Query — für Aufrufer, die neben den Summaries die Einzelzeilen brauchen. */
export async function getReactionRows(
  entityType: ReactionEntityType,
  entityIds: string[]
): Promise<EntityReactionRow[]> {
  if (entityIds.length === 0) return [];
  return getDrizzleInstance()
    .select()
    .from(entityReactions)
    .where(
      and(
        eq(entityReactions.entity_type, entityType),
        inArray(entityReactions.entity_id, entityIds)
      )
    )
    .orderBy(asc(entityReactions.created_at));
}

/** Dieselben Summaries wie `getReactionSummaries`, aber aus bereits geladenen Zeilen. */
export function summarizeReactionRows(
  rows: EntityReactionRow[],
  viewerId: string
): Map<string, ReactionSummary[]> {
  const aggregates = new Map<string, ReactionAggregateRow>();
  for (const r of rows) {
    const key = `${r.entity_id}\u0000${r.emoji}`;
    const agg = aggregates.get(key);
    if (!agg) {
      aggregates.set(key, {
        entity_id: r.entity_id,
        emoji: r.emoji,
        count: 1,
        reacted: r.user_id === viewerId,
        first_at: r.created_at,
      });
      continue;
    }
    agg.count++;
    agg.reacted ||= r.user_id === viewerId;
    if (new Date(r.created_at) < new Date(agg.first_at)) agg.first_at = r.created_at;
  }
  return toReactionSummaries([...aggregates.values()]);
}

export async function deleteReactionsForEntities(
  entityType: ReactionEntityType,
  entityIds: string[]
): Promise<void> {
  if (entityIds.length === 0) return;
  await getDrizzleInstance()
    .delete(entityReactions)
    .where(
      and(
        eq(entityReactions.entity_type, entityType),
        inArray(entityReactions.entity_id, entityIds)
      )
    );
}
