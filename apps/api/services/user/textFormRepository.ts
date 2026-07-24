/**
 * Repository for per-user learned writing styles ("angelernte Textformen").
 *
 * CRUD over `user_text_forms` plus the chat hot-path read `getTextFormForInjection`
 * (in-process 1h cache, mirrors prAgentInsightService). The row is converted to the
 * camelCase `TextForm` contract shape at the boundary.
 */

import {
  type TextForm,
  type TextFormGroupShare,
  type TextFormKind,
  type TextFormType,
} from '@gruenerator/contracts';
import { and, eq } from 'drizzle-orm';

import { userTextForms, type UserTextFormRow } from '../../database/schema/textForms.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

/** Discriminator in the polymorphic `group_content_shares` table. */
const TEXT_FORM_CONTENT_TYPE = 'user_text_forms';

export interface TextFormInput {
  kind: TextFormKind;
  textType?: TextFormType | null;
  mention: string;
  title: string;
  examples: Array<{ content: string }>;
  styleBlock: string;
  model?: string | null;
}

/** The minimal slice the injection path needs — no examples, no timestamps. */
export interface TextFormInjection {
  kind: TextFormKind;
  textType: TextFormType | null;
  title: string;
  styleBlock: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const injectionCache = new Map<string, { value: TextFormInjection | null; expires: number }>();

function cacheKey(userId: string, mention: string): string {
  return `${userId}::${mention}`;
}

function invalidateInjectionCache(userId: string, mention: string): void {
  injectionCache.delete(cacheKey(userId, mention));
}

function rowToTextForm(
  row: UserTextFormRow,
  extra: Partial<Pick<TextForm, 'sharedWithGroups' | 'sharedFromGroup' | 'ownerName'>> = {}
): TextForm {
  return {
    id: String(row.id),
    kind: row.kind as TextFormKind,
    textType: (row.text_type as TextFormType | null) ?? null,
    mention: row.mention,
    title: row.title,
    examples: row.examples,
    styleBlock: row.style_block,
    model: row.model ?? null,
    analyzedAt: row.analyzed_at ? row.analyzed_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
    sharedWithGroups: extra.sharedWithGroups ?? [],
    sharedFromGroup: extra.sharedFromGroup ?? null,
    ownerName: extra.ownerName ?? null,
  };
}

/** Which groups each of the given recipes is shared with. */
async function loadSharesFor(textFormIds: string[]): Promise<Map<string, TextFormGroupShare[]>> {
  const byForm = new Map<string, TextFormGroupShare[]>();
  if (textFormIds.length === 0) return byForm;

  const db = getPostgresInstance();
  const rows = (await db.query(
    `SELECT gcs.content_id, gcs.group_id, g.name AS group_name
       FROM group_content_shares gcs
       INNER JOIN groups g ON g.id = gcs.group_id
      WHERE gcs.content_type = $1 AND gcs.content_id = ANY($2::text[])`,
    [TEXT_FORM_CONTENT_TYPE, textFormIds]
  )) as unknown as Array<{ content_id: string; group_id: string; group_name: string }>;

  for (const row of rows) {
    const list = byForm.get(row.content_id) ?? [];
    list.push({ groupId: String(row.group_id), groupName: row.group_name });
    byForm.set(row.content_id, list);
  }
  return byForm;
}

/**
 * The user's own recipes plus every recipe shared into a group they belong to.
 *
 * Shared ones carry `sharedFromGroup`, so the UI can list them apart instead of
 * blending them into the user's own. A recipe the user already owns wins over an
 * incoming share of the same mention — otherwise a shared one could shadow it.
 */
export async function listTextForms(userId: string): Promise<TextForm[]> {
  const db = getDrizzleInstance();
  const ownRows = await db.select().from(userTextForms).where(eq(userTextForms.user_id, userId));
  const shares = await loadSharesFor(ownRows.map((r) => String(r.id)));
  const own = ownRows.map((row) =>
    rowToTextForm(row, { sharedWithGroups: shares.get(String(row.id)) ?? [] })
  );

  const pg = getPostgresInstance();
  const sharedRows = (await pg.query(
    `SELECT tf.*, g.name AS group_name, COALESCE(p.first_name, p.display_name) AS owner_name
       FROM user_text_forms tf
       INNER JOIN group_content_shares gcs
               ON gcs.content_type = $1 AND gcs.content_id = tf.id::text
       INNER JOIN groups g ON g.id = gcs.group_id
       INNER JOIN group_memberships gm
               ON gm.group_id = gcs.group_id AND gm.user_id = $2::uuid AND gm.is_active = TRUE
       LEFT JOIN profiles p ON p.id = tf.user_id
      WHERE tf.user_id <> $2::uuid`,
    [TEXT_FORM_CONTENT_TYPE, userId]
  )) as unknown as Array<UserTextFormRow & { group_name: string; owner_name: string | null }>;

  const ownMentions = new Set(own.map((f) => f.mention));
  const seenShared = new Set<string>();
  const shared: TextForm[] = [];
  for (const row of sharedRows) {
    if (ownMentions.has(row.mention) || seenShared.has(row.mention)) continue;
    seenShared.add(row.mention);
    shared.push(
      rowToTextForm(row, { sharedFromGroup: row.group_name, ownerName: row.owner_name ?? null })
    );
  }

  return [...own, ...shared];
}

/** Share a recipe the user owns with one of their groups. */
export async function shareTextFormWithGroup(
  userId: string,
  mention: string,
  groupId: string
): Promise<TextFormGroupShare[] | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: userTextForms.id })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);
  const form = rows[0];
  if (!form) return null;

  const pg = getPostgresInstance();
  // Membership is checked in SQL: the insert only happens for a group the user
  // is actually an active member of, so a forged group id cannot leak a recipe.
  await pg.query(
    `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id)
     SELECT gm.group_id, $1::uuid, $2, $3
       FROM group_memberships gm
      WHERE gm.group_id = $4::uuid AND gm.user_id = $1::uuid AND gm.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM group_content_shares x
           WHERE x.group_id = gm.group_id AND x.content_type = $2 AND x.content_id = $3
        )`,
    [userId, TEXT_FORM_CONTENT_TYPE, String(form.id), groupId]
  );

  const shares = await loadSharesFor([String(form.id)]);
  return shares.get(String(form.id)) ?? [];
}

export async function unshareTextFormFromGroup(
  userId: string,
  mention: string,
  groupId: string
): Promise<TextFormGroupShare[] | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: userTextForms.id })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);
  const form = rows[0];
  if (!form) return null;

  const pg = getPostgresInstance();
  await pg.query(
    `DELETE FROM group_content_shares
      WHERE content_type = $1 AND content_id = $2 AND group_id = $3::uuid`,
    [TEXT_FORM_CONTENT_TYPE, String(form.id), groupId]
  );

  const shares = await loadSharesFor([String(form.id)]);
  return shares.get(String(form.id)) ?? [];
}

export async function upsertTextForm(userId: string, input: TextFormInput): Promise<TextForm> {
  const db = getDrizzleInstance();
  const now = new Date();
  const values = {
    user_id: userId,
    kind: input.kind,
    text_type: input.textType ?? null,
    mention: input.mention,
    title: input.title,
    examples: input.examples,
    style_block: input.styleBlock,
    model: input.model ?? null,
    analyzed_at: now,
    updated_at: now,
  };
  const rows = await db
    .insert(userTextForms)
    .values(values)
    .onConflictDoUpdate({
      target: [userTextForms.user_id, userTextForms.mention],
      set: {
        kind: values.kind,
        text_type: values.text_type,
        title: values.title,
        examples: values.examples,
        style_block: values.style_block,
        model: values.model,
        analyzed_at: values.analyzed_at,
        updated_at: values.updated_at,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to upsert text form');
  invalidateInjectionCache(userId, input.mention);
  return rowToTextForm(row);
}

export async function deleteTextForm(userId: string, mention: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .delete(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .returning({ id: userTextForms.id });
  invalidateInjectionCache(userId, mention);
  return rows.length > 0;
}

/**
 * Chat hot-path read: the injectable style for `(userId, mention)`, or null when
 * the user has no learned form for it. Cached in-process for 1h; never runs the
 * LLM. Invalidated on upsert/delete of the same key.
 */
export async function getTextFormForInjection(
  userId: string,
  mention: string
): Promise<TextFormInjection | null> {
  const key = cacheKey(userId, mention);
  const cached = injectionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  // Own recipe first, then any shared into one of the user's groups — a shared
  // recipe has to actually inject its style, or sharing would be cosmetic.
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT tf.kind, tf.text_type, tf.title, tf.style_block
       FROM user_text_forms tf
      WHERE tf.mention = $2
        AND (
          tf.user_id = $1::uuid
          OR tf.id::text IN (
            SELECT gcs.content_id FROM group_content_shares gcs
             INNER JOIN group_memberships gm
                     ON gm.group_id = gcs.group_id AND gm.user_id = $1::uuid AND gm.is_active = TRUE
             WHERE gcs.content_type = $3
          )
        )
      ORDER BY (tf.user_id = $1::uuid) DESC
      LIMIT 1`,
    [userId, mention, TEXT_FORM_CONTENT_TYPE]
  )) as unknown as Array<{
    kind: string;
    text_type: string | null;
    title: string;
    style_block: string;
  }>;

  const r = rows[0];
  const value: TextFormInjection | null =
    r && r.style_block
      ? {
          kind: r.kind as TextFormKind,
          textType: (r.text_type as TextFormType | null) ?? null,
          title: r.title,
          styleBlock: r.style_block,
        }
      : null;

  injectionCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}
