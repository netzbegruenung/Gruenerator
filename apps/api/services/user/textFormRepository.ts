/**
 * Repository for per-user learned writing styles ("angelernte Textformen").
 *
 * CRUD over `user_text_forms` plus the chat hot-path reads
 * `getTextFormForInjection` (by mention) and `getTextFormForInjectionById`
 * (by row id), both served from an in-process cache. The row is converted to
 * the camelCase `TextForm` contract shape at the boundary.
 *
 * Visibility is the same three-step ladder as user agents: the caller's own
 * row, then anything shared into one of their groups, then the public catalog.
 * Only `kind = 'custom'` rows may be group-shared or published — a published
 * `preset`/`recipe` row would replace a system recipe for everyone who sees it.
 */

import {
  type MentionableTextForm,
  type PublicOwnership,
  type TextForm,
  type TextFormGroupShare,
  type TextFormKind,
  type TextFormShareMode,
  type TextFormType,
} from '@gruenerator/contracts';
import { hasSystemRecipe } from '@gruenerator/shared/agents';
import { and, eq } from 'drizzle-orm';

import { userTextForms, type UserTextFormRow } from '../../database/schema/textForms.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import { pickVisibleTextForm, type TextFormAccess } from './textFormVisibility.js';

/** Discriminator in the polymorphic `group_content_shares` table. */
const TEXT_FORM_CONTENT_TYPE = 'user_text_forms';

/** Only custom recipes may be shared or published — see the module docblock. */
const SHAREABLE_KIND: TextFormKind = 'custom';

export interface TextFormInput {
  kind: TextFormKind;
  textType?: TextFormType | null;
  mention: string;
  title: string;
  examples: Array<{ content: string }>;
  styleBlock: string;
  model?: string | null;
  description?: string | null;
  iconKey?: string | null;
}

/** The minimal slice the injection path needs — no examples, no timestamps. */
export interface TextFormInjection {
  /** Row id, so a caller that resolved by mention can pin the row it got. */
  id: string;
  kind: TextFormKind;
  textType: TextFormType | null;
  title: string;
  styleBlock: string;
  /** How the caller reached this row — own, via a group share, or public. */
  access: TextFormAccess;
}

/** Sharing state of one recipe, owner-scoped. Mirrors `UserAgentSharing`
 * without `audience`: recipes have no locale. */
export interface TextFormSharing {
  /** The recipe's UUID — the group_content_shares.content_id for this row. */
  id: string;
  share_mode: TextFormShareMode;
  is_public: boolean;
  public_ownership: PublicOwnership | null;
}

export interface TextFormSharingPatch {
  share_mode?: TextFormShareMode;
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
}

/**
 * `updated: false` means "no such recipe for this owner" (the router's 404),
 * `reason: 'not_custom'` means the row exists but is a preset/recipe override
 * and must not be shared (the router's 409). Same `{ ok }` verdict shape as
 * `textFormKind.ts`, minus the HTTP status — that mapping belongs to the router.
 */
export type TextFormSharingResult =
  { ok: true; updated: boolean } | { ok: false; reason: 'not_custom' };

// ── Injection cache ──────────────────────────────────────────────────────────

/** A row the caller owns changes only when they change it, and every writer
 * runs `invalidateInjectionCache` — so it may be held for an hour. */
const OWN_TTL_MS = 60 * 60 * 1000;
/**
 * A foreign row (group-shared or public) — and a `null` result, which a foreign
 * row could turn into a hit — is held for five minutes only.
 *
 * The cache is per PROCESS, and the API runs in cluster mode: a share toggled
 * in worker A does not reach worker B's map, so B keeps serving its stale
 * answer until this TTL runs out. Issue #3470 records that limitation; until it
 * is fixed, this number IS the propagation delay for every sharing change.
 */
const FOREIGN_TTL_MS = 5 * 60 * 1000;

const injectionCache = new Map<string, { value: TextFormInjection | null; expires: number }>();

/** Cache key. The scope prefix keeps the two lookups apart; the `::` before the
 * lookup value is what `invalidateInjectionCache` matches on. */
export function injectionCacheKey(scope: 'mention' | 'id', userId: string, value: string): string {
  return `${scope}:${userId}::${value}`;
}

/** TTL policy: own rows an hour, everything else (including a miss) five minutes. */
export function injectionTtlMs(value: TextFormInjection | null): number {
  return value && value.access === 'own' ? OWN_TTL_MS : FOREIGN_TTL_MS;
}

/**
 * Drops every cached entry for this row — under both scopes and for EVERY user,
 * not just the owner: a recipe shared or published reaches other users' caches
 * too, and they key it by their own id. Hence the suffix match rather than the
 * owner's key; `userId` is deliberately not a parameter.
 */
function invalidateInjectionCache(mention: string, id: string | null): void {
  const suffixes = id ? [`::${mention}`, `::${id}`] : [`::${mention}`];
  for (const key of injectionCache.keys()) {
    if (suffixes.some((suffix) => key.endsWith(suffix))) injectionCache.delete(key);
  }
}

/**
 * A sharing change moves a row between access levels for an unbounded set of
 * users, so there is no cheap key set to invalidate — the map is small and
 * refills from the hot path within a turn.
 */
function invalidateAllTextFormInjections(): void {
  injectionCache.clear();
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
    description: row.description ?? null,
    iconKey: row.icon_key ?? null,
    shareMode: row.share_mode as TextFormShareMode,
    isPublic: row.is_public,
    publicOwnership: (row.public_ownership as PublicOwnership | null) ?? null,
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
 * Both SELECTs are `*`, so the recipe/sharing columns come along.
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
      WHERE tf.user_id <> $2::uuid
      ORDER BY tf.created_at, tf.id, g.name`,
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

/**
 * Public Agentura discovery feed: recipes listed publicly (is_public=true atop
 * share_mode='authenticated'). `kind = 'custom'` is part of the predicate, not
 * a later filter — a published preset would replace a system recipe for every
 * reader of this list.
 */
export async function listPublicTextForms(limit = 200): Promise<TextForm[]> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT tf.*, COALESCE(p.first_name, p.display_name) AS owner_name
       FROM user_text_forms tf
       LEFT JOIN profiles p ON p.id = tf.user_id
      WHERE tf.kind = $1 AND tf.is_public = TRUE AND tf.share_mode = 'authenticated'
      ORDER BY tf.updated_at DESC, tf.id
      LIMIT $2`,
    [SHAREABLE_KIND, limit]
  )) as unknown as Array<UserTextFormRow & { owner_name: string | null }>;

  return rows.map((row) => rowToTextForm(row, { ownerName: row.owner_name ?? null }));
}

/** An active group share of `tf` reaching `$1::uuid`. Written once, used by
 * every query that has to answer "may this user see this row". */
const GROUP_SHARE_EXISTS = `EXISTS (
          SELECT 1 FROM group_content_shares gcs
           INNER JOIN group_memberships gm
                   ON gm.group_id = gcs.group_id AND gm.user_id = $1::uuid AND gm.is_active = TRUE
           WHERE gcs.content_type = $2 AND gcs.content_id = tf.id::text
        )`;

/** The public disjunct: listed, authenticated — and custom, never a system override. */
const PUBLIC_VISIBLE = `(tf.is_public = TRUE AND tf.share_mode = 'authenticated' AND tf.kind = 'custom')`;

const VISIBLE_TO_CALLER = `(
          tf.user_id = $1::uuid
          OR ${GROUP_SHARE_EXISTS}
          OR ${PUBLIC_VISIBLE}
        )`;

/** own 0 / group 1 / public 2 — the precedence `pickVisibleTextForm` encodes,
 * expressed in SQL so a `LIMIT 1` can rely on it. */
const ACCESS_RANK_SQL = `CASE
          WHEN tf.user_id = $1::uuid THEN 0
          WHEN ${GROUP_SHARE_EXISTS} THEN 1
          ELSE 2
        END`;

const ACCESS_BY_RANK: readonly TextFormAccess[] = ['own', 'group', 'public'];

function accessFromRank(rank: number | string): TextFormAccess {
  return ACCESS_BY_RANK[Number(rank)] ?? 'public';
}

/** Selector is the row-identifying predicate on `$3`; everything else is shared. */
function injectionSql(selector: string): string {
  return `SELECT tf.id, tf.kind, tf.text_type, tf.title, tf.style_block,
            ${ACCESS_RANK_SQL} AS access_rank
       FROM user_text_forms tf
      WHERE ${selector}
        AND ${VISIBLE_TO_CALLER}
      ORDER BY access_rank, tf.created_at, tf.id
      LIMIT 1`;
}

const INJECTION_BY_MENTION_SQL = injectionSql('tf.mention = $3');
const INJECTION_BY_ID_SQL = injectionSql('tf.id = $3::uuid');

interface InjectionRow {
  id: string;
  kind: string;
  text_type: string | null;
  title: string;
  style_block: string;
  access_rank: number | string;
}

async function loadInjection(
  sql: string,
  userId: string,
  selectorValue: string
): Promise<TextFormInjection | null> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(sql, [
    userId,
    TEXT_FORM_CONTENT_TYPE,
    selectorValue,
  ])) as unknown as InjectionRow[];

  const r = rows[0];
  if (!r || !r.style_block) return null;
  return {
    id: String(r.id),
    kind: r.kind as TextFormKind,
    textType: (r.text_type as TextFormType | null) ?? null,
    title: r.title,
    styleBlock: r.style_block,
    access: accessFromRank(r.access_rank),
  };
}

async function cachedInjection(
  key: string,
  load: () => Promise<TextFormInjection | null>
): Promise<TextFormInjection | null> {
  const cached = injectionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const value = await load();
  injectionCache.set(key, { value, expires: Date.now() + injectionTtlMs(value) });
  return value;
}

/**
 * Chat hot-path read: the injectable style for `(userId, mention)`, or null when
 * no visible recipe carries it. Own recipe first, then one shared into one of the
 * user's groups, then a public one — a shared or published recipe has to actually
 * inject its style, or sharing would be cosmetic. Never runs the LLM.
 */
export async function getTextFormForInjection(
  userId: string,
  mention: string
): Promise<TextFormInjection | null> {
  return cachedInjection(injectionCacheKey('mention', userId, mention), () =>
    loadInjection(INJECTION_BY_MENTION_SQL, userId, mention)
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The same read pinned to one row. An agent config stores the recipe's id, so a
 * rename of the mention cannot silently swap the recipe underneath it; the
 * caller falls back to the mention lookup when this returns null.
 *
 * A malformed id resolves to null instead of reaching Postgres: `$3::uuid` would
 * raise, and a stale id in persisted config is an expected input, not a bug.
 */
export async function getTextFormForInjectionById(
  id: string,
  userId: string
): Promise<TextFormInjection | null> {
  if (!UUID_RE.test(id)) return null;
  return cachedInjection(injectionCacheKey('id', userId, id), () =>
    loadInjection(INJECTION_BY_ID_SQL, userId, id)
  );
}

/** Owner-scoped lookup of a recipe's sharing state (and its UUID). */
export async function getTextFormSharing(
  userId: string,
  mention: string
): Promise<TextFormSharing | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      id: userTextForms.id,
      share_mode: userTextForms.share_mode,
      is_public: userTextForms.is_public,
      public_ownership: userTextForms.public_ownership,
    })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: String(row.id),
    share_mode: row.share_mode as TextFormShareMode,
    is_public: row.is_public,
    public_ownership: (row.public_ownership as PublicOwnership | null) ?? null,
  };
}

/**
 * Owner-scoped update of the sharing fields. Presets and recipe overrides are
 * refused: publishing one would put a replacement for a system recipe in front
 * of everyone, which is not the owner's to give.
 */
export async function updateTextFormSharing(
  userId: string,
  mention: string,
  patch: TextFormSharingPatch
): Promise<TextFormSharingResult> {
  const db = getDrizzleInstance();
  const existing = await db
    .select({ id: userTextForms.id, kind: userTextForms.kind })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);
  const row = existing[0];
  if (!row) return { ok: true, updated: false };
  if (row.kind !== SHAREABLE_KIND) return { ok: false, reason: 'not_custom' };

  const values: Record<string, unknown> = { updated_at: new Date() };
  if (patch.share_mode !== undefined) values.share_mode = patch.share_mode;
  if (patch.is_public !== undefined) values.is_public = patch.is_public;
  if (patch.public_ownership !== undefined) values.public_ownership = patch.public_ownership;

  const updated = await db
    .update(userTextForms)
    .set(values)
    .where(eq(userTextForms.id, row.id))
    .returning({ id: userTextForms.id });

  invalidateAllTextFormInjections();
  return { ok: true, updated: updated.length > 0 };
}

/** The recipe `mention` names, if `userId` owns it AND it may be shared.
 * A preset or recipe override takes the same path as a missing row. */
async function findShareableOwnRow(
  userId: string,
  mention: string
): Promise<{ id: string } | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: userTextForms.id })
    .from(userTextForms)
    .where(
      and(
        eq(userTextForms.user_id, userId),
        eq(userTextForms.mention, mention),
        eq(userTextForms.kind, SHAREABLE_KIND)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? { id: String(row.id) } : null;
}

/** Share a recipe the user owns with one of their groups. */
export async function shareTextFormWithGroup(
  userId: string,
  mention: string,
  groupId: string
): Promise<TextFormGroupShare[] | null> {
  const form = await findShareableOwnRow(userId, mention);
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
    [userId, TEXT_FORM_CONTENT_TYPE, form.id, groupId]
  );

  invalidateAllTextFormInjections();
  const shares = await loadSharesFor([form.id]);
  return shares.get(form.id) ?? [];
}

export async function unshareTextFormFromGroup(
  userId: string,
  mention: string,
  groupId: string
): Promise<TextFormGroupShare[] | null> {
  const form = await findShareableOwnRow(userId, mention);
  if (!form) return null;

  const pg = getPostgresInstance();
  await pg.query(
    `DELETE FROM group_content_shares
      WHERE content_type = $1 AND content_id = $2 AND group_id = $3::uuid`,
    [TEXT_FORM_CONTENT_TYPE, form.id, groupId]
  );

  invalidateAllTextFormInjections();
  const shares = await loadSharesFor([form.id]);
  return shares.get(form.id) ?? [];
}

/**
 * Create or replace the caller's recipe under `mention`.
 *
 * `share_mode`, `is_public` and `public_ownership` are NOT in the conflict set:
 * they are bound to the row, not to its content — exactly as for user agents,
 * where `public_ownership` is a legal attestation about THIS row. An edit must
 * not silently re-publish a recipe the owner un-published, nor carry an old
 * attestation over to new content.
 */
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
    description: input.description ?? null,
    icon_key: input.iconKey ?? null,
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
        description: values.description,
        icon_key: values.icon_key,
        analyzed_at: values.analyzed_at,
        updated_at: values.updated_at,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to upsert text form');
  invalidateInjectionCache(input.mention, String(row.id));
  return rowToTextForm(row);
}

export async function deleteTextForm(userId: string, mention: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .delete(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .returning({ id: userTextForms.id });
  invalidateInjectionCache(mention, rows[0] ? String(rows[0].id) : null);
  return rows.length > 0;
}

// ── Mentionable list ─────────────────────────────────────────────────────────

interface MentionableRow {
  id: string;
  user_id: string;
  created_at: Date | string;
  mention: string;
  title: string;
  description: string | null;
  icon_key: string | null;
  kind: string;
  is_public: boolean;
  access_rank: number | string;
  group_name: string | null;
  owner_name: string | null;
}

/**
 * The recipes the caller can name with an `@mention`: their own, plus every
 * recipe shared into a group they are an active member of, plus the public
 * catalog. One query with the same rank the injection path uses, so the picker
 * offers the row `getTextFormForInjection` will load — a picker that named a
 * different one would hand the chat something else than it showed.
 *
 * `group_name` is a scalar subquery ordered by name: a recipe shared into
 * SEVERAL of the caller's groups would otherwise be credited to whichever group
 * Postgres felt like returning, and the sublabel would flip between page loads.
 *
 * Presets and recipe overrides replace a system recipe's body; they are not
 * separate menu entries — except when no system recipe exists (`antrag`), which
 * is why the filter asks `hasSystemRecipe` rather than `kind` alone (#2937).
 */
export async function listMentionableTextForms(
  userId: string,
  limit = 200
): Promise<MentionableTextForm[]> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT tf.id, tf.user_id, tf.created_at, tf.mention, tf.title, tf.description,
            tf.icon_key, tf.kind, tf.is_public,
            ${ACCESS_RANK_SQL} AS access_rank,
            (SELECT g.name
               FROM group_content_shares gcs
               INNER JOIN groups g ON g.id = gcs.group_id
               INNER JOIN group_memberships gm
                       ON gm.group_id = gcs.group_id AND gm.user_id = $1::uuid
                      AND gm.is_active = TRUE
              WHERE gcs.content_type = $2 AND gcs.content_id = tf.id::text
              ORDER BY g.name
              LIMIT 1) AS group_name,
            COALESCE(p.first_name, p.display_name) AS owner_name
       FROM user_text_forms tf
       LEFT JOIN profiles p ON p.id = tf.user_id
      WHERE ${VISIBLE_TO_CALLER}
      ORDER BY access_rank, tf.created_at, tf.id
      LIMIT $3`,
    [userId, TEXT_FORM_CONTENT_TYPE, limit]
  )) as unknown as MentionableRow[];

  const withAccess = rows.map((row) => ({ ...row, access: accessFromRank(row.access_rank) }));

  const byMention = new Map<string, (typeof withAccess)[number][]>();
  for (const row of withAccess) {
    const list = byMention.get(row.mention) ?? [];
    list.push(row);
    byMention.set(row.mention, list);
  }

  // Map iteration order is first-occurrence order, which the SQL ORDER BY has
  // already made winner order — so own recipes come first, as in `listTextForms`.
  const out: MentionableTextForm[] = [];
  for (const candidates of byMention.values()) {
    const winner = pickVisibleTextForm(candidates, userId);
    if (!winner) continue;
    if (winner.kind !== 'custom' && hasSystemRecipe(winner.mention)) continue;
    out.push({
      id: String(winner.id),
      mention: winner.mention,
      title: winner.title,
      description: winner.description ?? null,
      iconKey: winner.icon_key ?? null,
      kind: winner.kind as TextFormKind,
      sharedFromGroup: winner.access === 'group' ? (winner.group_name ?? null) : null,
      ownerName: winner.access === 'own' ? null : (winner.owner_name ?? null),
      isPublic: winner.is_public,
    });
  }
  return out;
}
