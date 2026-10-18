/**
 * Emoji-Reaktionen auf Beiträge und Kommentare (`entity_reactions`).
 *
 * Je Entitätstyp eine eigene FK-Spalte mit ON DELETE CASCADE — Postgres räumt
 * die Reaktionen mit ihrer Entität ab, keine Löschstelle muss daran denken.
 * Nach außen bleibt es `(entityType, entityId)`; `REACTION_TARGET_COLUMN`
 * übersetzt. Alle Kommentar-Typen (auch die alten `agent_comment` und
 * `template_comment`) zeigen auf `entity_comment_id`. Ein Marktplatz-Beitrag
 * hat keine Zeile: seine Reaktionen tragen `(item_type, item_id)`, den
 * Like-Schlüssel (`*ItemReaction*`); das alte `agent` ist `('agent', id)`. Wer reagieren darf, entscheidet `reactionTargets.ts` — dieser
 * Dienst prüft keine Rechte. Die ids müssen UUIDs sein (sonst 22P02); das
 * stellen `reactionTargets` bzw. die aus der DB gelesenen ids der Aufrufer sicher.
 */
import {
  type EntityCommentType,
  REACTION_EMOJIS,
  type ReactionEntityType,
  type ReactionSummary,
} from '@gruenerator/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { entityReactions, type EntityReactionRow } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

/** The entity types that address a row; items go through the `*ItemReaction*` functions. */
export type RowReactionEntityType = Exclude<ReactionEntityType, 'agent' | 'marketplace_item'>;

export const REACTION_TARGET_COLUMN = {
  group_share: entityReactions.group_share_id,
  group_comment: entityReactions.group_comment_id,
  board_comment: entityReactions.board_comment_id,
  agent_comment: entityReactions.entity_comment_id,
  template_comment: entityReactions.entity_comment_id,
  entity_comment: entityReactions.entity_comment_id,
} satisfies Record<RowReactionEntityType, unknown>;

/** Die gesetzte Ziel-Spalte einer Zeile; der CHECK garantiert genau eine. */
function targetIdOf(row: EntityReactionRow): string {
  return (row.group_share_id ??
    row.group_comment_id ??
    row.board_comment_id ??
    row.entity_comment_id ??
    row.item_id ??
    row.agent_id ??
    row.agent_comment_id ??
    row.template_comment_id)!;
}

export async function addReaction(
  userId: string,
  entityType: RowReactionEntityType,
  entityId: string,
  emoji: string
): Promise<EntityReactionRow | null> {
  const rows = await getDrizzleInstance()
    .insert(entityReactions)
    .values({ user_id: userId, [REACTION_TARGET_COLUMN[entityType].name]: entityId, emoji })
    // Ohne target: greift für jeden der drei partiellen Unique-Indizes.
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

export async function removeReaction(
  userId: string,
  entityType: RowReactionEntityType,
  entityId: string,
  emoji: string
): Promise<void> {
  await getDrizzleInstance()
    .delete(entityReactions)
    .where(
      and(
        eq(entityReactions.user_id, userId),
        eq(REACTION_TARGET_COLUMN[entityType], entityId),
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
  entityType: RowReactionEntityType,
  entityIds: string[],
  viewerId: string
): Promise<Map<string, ReactionSummary[]>> {
  if (entityIds.length === 0) return new Map();
  const column = REACTION_TARGET_COLUMN[entityType];
  const rows = await getDrizzleInstance()
    .select({
      entity_id: sql<string>`${column}`,
      emoji: entityReactions.emoji,
      count: sql<number>`count(*)::int`,
      reacted: sql<boolean>`bool_or(${entityReactions.user_id} = ${viewerId})`,
      first_at: sql<Date | string>`min(${entityReactions.created_at})`,
    })
    .from(entityReactions)
    .where(inArray(column, entityIds))
    .groupBy(column, entityReactions.emoji);
  return toReactionSummaries(rows);
}

export async function addItemReaction(
  userId: string,
  itemType: EntityCommentType,
  itemId: string,
  emoji: string
): Promise<EntityReactionRow | null> {
  const rows = await getDrizzleInstance()
    .insert(entityReactions)
    .values({ user_id: userId, item_type: itemType, item_id: itemId, emoji })
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

export async function removeItemReaction(
  userId: string,
  itemType: EntityCommentType,
  itemId: string,
  emoji: string
): Promise<void> {
  await getDrizzleInstance()
    .delete(entityReactions)
    .where(
      and(
        eq(entityReactions.user_id, userId),
        eq(entityReactions.item_type, itemType),
        eq(entityReactions.item_id, itemId),
        eq(entityReactions.emoji, emoji)
      )
    );
}

/** Wie `getReactionSummaries`, für Beiträge einer Art; die Map ist nach `item_id` geschlüsselt. */
export async function getItemReactionSummaries(
  itemType: EntityCommentType,
  itemIds: string[],
  viewerId: string
): Promise<Map<string, ReactionSummary[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await getDrizzleInstance()
    .select({
      entity_id: sql<string>`${entityReactions.item_id}`,
      emoji: entityReactions.emoji,
      count: sql<number>`count(*)::int`,
      reacted: sql<boolean>`bool_or(${entityReactions.user_id} = ${viewerId})`,
      first_at: sql<Date | string>`min(${entityReactions.created_at})`,
    })
    .from(entityReactions)
    .where(and(eq(entityReactions.item_type, itemType), inArray(entityReactions.item_id, itemIds)))
    .groupBy(entityReactions.item_id, entityReactions.emoji);
  return toReactionSummaries(rows);
}

/** Rohe Zeilen für alle ids in einem Query — für Aufrufer, die neben den Summaries die Einzelzeilen brauchen. */
export async function getReactionRows(
  entityType: RowReactionEntityType,
  entityIds: string[]
): Promise<EntityReactionRow[]> {
  if (entityIds.length === 0) return [];
  return getDrizzleInstance()
    .select()
    .from(entityReactions)
    .where(inArray(REACTION_TARGET_COLUMN[entityType], entityIds))
    .orderBy(asc(entityReactions.created_at));
}

/** Dieselben Summaries wie `getReactionSummaries`, aber aus bereits geladenen Zeilen. */
export function summarizeReactionRows(
  rows: EntityReactionRow[],
  viewerId: string
): Map<string, ReactionSummary[]> {
  const aggregates = new Map<string, ReactionAggregateRow>();
  for (const r of rows) {
    const entityId = targetIdOf(r);
    const key = `${entityId}\u0000${r.emoji}`;
    const agg = aggregates.get(key);
    if (!agg) {
      aggregates.set(key, {
        entity_id: entityId,
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
