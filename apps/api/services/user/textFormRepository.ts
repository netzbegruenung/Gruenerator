/**
 * Repository for per-user learned writing styles ("angelernte Textformen").
 *
 * CRUD over `user_text_forms` plus the chat hot-path read `getTextFormForInjection`
 * (in-process 1h cache, mirrors prAgentInsightService). The row is converted to the
 * camelCase `TextForm` contract shape at the boundary.
 */

import { type TextForm, type TextFormKind, type TextFormType } from '@gruenerator/contracts';
import { and, eq } from 'drizzle-orm';

import { userTextForms, type UserTextFormRow } from '../../database/schema/textForms.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

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

function rowToTextForm(row: UserTextFormRow): TextForm {
  return {
    kind: row.kind as TextFormKind,
    textType: (row.text_type as TextFormType | null) ?? null,
    mention: row.mention,
    title: row.title,
    examples: row.examples,
    styleBlock: row.style_block,
    model: row.model ?? null,
    analyzedAt: row.analyzed_at ? row.analyzed_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listTextForms(userId: string): Promise<TextForm[]> {
  const db = getDrizzleInstance();
  const rows = await db.select().from(userTextForms).where(eq(userTextForms.user_id, userId));
  return rows.map(rowToTextForm);
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

  const db = getDrizzleInstance();
  const rows = await db
    .select({
      kind: userTextForms.kind,
      text_type: userTextForms.text_type,
      title: userTextForms.title,
      style_block: userTextForms.style_block,
    })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);

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
