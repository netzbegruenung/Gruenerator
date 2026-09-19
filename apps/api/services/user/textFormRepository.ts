/**
 * Repository for per-user learned writing styles ("angelernte Textformen").
 *
 * CRUD over `user_text_forms` plus the chat hot-path reads
 * `getTextFormForInjection` (by mention) and `getTextFormForInjectionById`
 * (by row id). Both read Postgres on every call: the selectors are indexed
 * (`idx_user_text_forms_mention`, the primary key), and a chat turn does at
 * most two of them next to an LLM call that costs seconds. They were cached
 * in-process until #3470 — the API runs in cluster mode, so a write only ever
 * invalidated the one worker that handled it while every other worker kept
 * serving its stale answer until the TTL ran out. The row is converted to the
 * camelCase `TextForm` contract shape at the boundary.
 *
 * Visibility is the same three-step ladder as user agents: the caller's own
 * row, then anything shared into one of their groups, then the public catalog.
 * Was über den eigenen Zugang hinausreichen darf, entscheidet `isShareableTextForm`
 * — eine veröffentlichte `preset`/`recipe`-Zeile (und ebenso eine `custom`-Zeile
 * auf der Mention eines Systemrezepts) ersetzte das Systemrezept für alle, die
 * sie zu sehen bekämen.
 */

import {
  type MentionableTextForm,
  type PublicOwnership,
  type PublicTextForm,
  type TextForm,
  type TextFormGroupShare,
  type TextFormKind,
  type TextFormShareMode,
  type TextFormType,
} from '@gruenerator/contracts';
import { and, eq, sql } from 'drizzle-orm';

import { userTextForms, type UserTextFormRow } from '../../database/schema/textForms.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import {
  isListableTextForm,
  isShareableTextForm,
  pickVisibleTextForm,
  type TextFormAccess,
} from './textFormVisibility.js';

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
  /**
   * `undefined` heisst „nicht mitgesendet" und lässt den gespeicherten Wert
   * stehen; `null` leert das Feld ausdrücklich. Siehe {@link mergeOptionalColumn}.
   */
  description?: string | null | undefined;
  /** Wie {@link TextFormInput.description}: `undefined` behält, `null` leert. */
  iconKey?: string | null | undefined;
}

/** The minimal slice the injection path needs — no examples, no timestamps. */
export interface TextFormInjection {
  /** Row id, so a caller that resolved by mention can pin the row it got. */
  id: string;
  /**
   * The row's own canonical mention — NOT the one the caller asked with. A
   * lookup by id has no other way to learn which recipe it pinned, and deciding
   * that from the turn's mention attributed the wrong recipe (#2939).
   */
  mention: string;
  kind: TextFormKind;
  textType: TextFormType | null;
  title: string;
  styleBlock: string;
  /** How the caller reached this row — own, via a group share, or public. */
  access: TextFormAccess;
}

/** The three sharing fields, without the row they belong to — what a patch
 * resolves against and what `applySharingPatch` returns. */
export interface TextFormSharingState {
  share_mode: TextFormShareMode;
  is_public: boolean;
  public_ownership: PublicOwnership | null;
}

/** Sharing state of one recipe, owner-scoped. Mirrors `UserAgentSharing`
 * without `audience`: recipes have no locale. */
export interface TextFormSharing extends TextFormSharingState {
  /** The recipe's UUID — the group_content_shares.content_id for this row. */
  id: string;
}

export interface TextFormSharingPatch {
  share_mode?: TextFormShareMode;
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
}

/**
 * `updated: false` means "no such recipe for this owner" (the router's 404),
 * `reason: 'not_custom'` means the row exists but is a preset/recipe override
 * and must not be shared (409), `reason: 'ownership_required'` that the patch
 * would list the recipe publicly without the ownership attestation (400/409).
 * Same `{ ok }` verdict shape as `textFormKind.ts`, minus the HTTP status —
 * that mapping belongs to the router.
 */
export type TextFormSharingResult =
  { ok: true; updated: boolean } | { ok: false; reason: 'not_custom' | 'ownership_required' };

/** What {@link applySharingPatch} decided: the state to write, or why not. */
export type SharingPatchVerdict =
  { ok: true; next: TextFormSharingState } | { ok: false; reason: 'ownership_required' };

/**
 * The sharing state a patch leaves behind — the three fields are not
 * independent, and this is the only place that says how.
 *
 *  (a) Public listing sits ATOP `share_mode = 'authenticated'`. Narrowing the
 *      mode therefore un-lists the recipe and drops the attestation with it;
 *      leaving `is_public = true` on a private row would re-publish it the
 *      moment the mode widened again.
 *  (b) Listing publicly without `public_ownership` is refused outright: the
 *      field is the owner's legal attestation for THIS recipe, and the contract
 *      promises it is non-null whenever `is_public` is. Nothing is written.
 *  (c) Un-listing clears the attestation — it is a statement about a listing
 *      that no longer exists, and keeping it would silently cover the next one.
 *
 * Pure, so the rule is testable without Postgres; `updateTextFormSharing` is
 * its only caller and the single chokepoint for every sharing write.
 */
export function applySharingPatch(
  current: TextFormSharingState,
  patch: TextFormSharingPatch
): SharingPatchVerdict {
  const share_mode = patch.share_mode ?? current.share_mode;
  const is_public = patch.is_public ?? current.is_public;
  const public_ownership =
    patch.public_ownership !== undefined ? patch.public_ownership : current.public_ownership;

  if (share_mode !== 'authenticated') {
    return { ok: true, next: { share_mode, is_public: false, public_ownership: null } };
  }
  if (is_public && public_ownership === null) return { ok: false, reason: 'ownership_required' };
  if (!is_public)
    return { ok: true, next: { share_mode, is_public: false, public_ownership: null } };
  return { ok: true, next: { share_mode, is_public, public_ownership } };
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

/** Die öffentliche Projektion einer Zeile: was der Katalog von einem fremden
 * Rezept zeigen darf. Die Begründung steht am `publicTextFormSchema`. */
function toPublicTextForm(form: TextForm): PublicTextForm {
  // Weggelassen, nicht vergessen: `_sharedWithGroups` nennt die Projekte des
  // Eigentümers, `examples` seine Originaltexte.
  const { examples, sharedWithGroups: _sharedWithGroups, ...rest } = form;
  return { ...rest, exampleCount: examples.length };
}

/**
 * Public Agentura discovery feed: recipes listed publicly (is_public=true atop
 * share_mode='authenticated'). Das Prädikat ist dasselbe {@link PUBLIC_VISIBLE},
 * das die Injektion als öffentlichen Zweig führt — zweimal geschrieben hiesse,
 * dass der Katalog etwas anzeigen kann, was der Chat nicht lädt.
 *
 * `isShareableTextForm` siebt danach in TS nach: die SQL-Bedingung kennt nur
 * `kind`, nicht ob die Mention ein Systemrezept verdeckt.
 *
 * Die Antwort trägt die Beispiele NICHT — es sind die Originaltexte fremder
 * Leute; veröffentlicht ist die Anweisung, nicht ihr Rohstoff.
 */
export async function listPublicTextForms(limit = 200): Promise<PublicTextForm[]> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT tf.*, COALESCE(p.first_name, p.display_name) AS owner_name
       FROM user_text_forms tf
       LEFT JOIN profiles p ON p.id = tf.user_id
      WHERE ${PUBLIC_VISIBLE}
      ORDER BY tf.updated_at DESC, tf.id
      LIMIT $1`,
    [limit]
  )) as unknown as Array<UserTextFormRow & { owner_name: string | null }>;

  return rows
    .filter((row) => isShareableTextForm(row.kind as TextFormKind, row.mention))
    .map((row) => toPublicTextForm(rowToTextForm(row, { ownerName: row.owner_name ?? null })));
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

/** Was der Aufrufer OHNE den offenen Katalog sieht: seine eigenen Zeilen und
 * die, die in eines seiner Projekte geteilt sind. */
const VISIBLE_TO_CALLER_NO_PUBLIC = `(
          tf.user_id = $1::uuid
          OR ${GROUP_SHARE_EXISTS}
        )`;

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
  return `SELECT tf.id, tf.mention, tf.kind, tf.text_type, tf.title, tf.style_block,
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
  mention: string;
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
  const kind = r.kind as TextFormKind;
  const access = accessFromRank(r.access_rank);
  // Der öffentliche Zweig der Abfrage kennt nur `kind`. Eine `custom`-Zeile,
  // deren Mention ein Systemrezept verdeckt, kam vor dieser Regel durch die
  // Veröffentlichung und würde Fremden hier das Systemrezept austauschen.
  // Eigene und in ein Projekt geteilte Zeilen sind davon unberührt: dort hat
  // jemand die Zeile bewusst gewählt bzw. bewusst hereingelassen.
  if (access === 'public' && !isShareableTextForm(kind, r.mention)) return null;
  return {
    id: String(r.id),
    mention: r.mention,
    kind,
    textType: (r.text_type as TextFormType | null) ?? null,
    title: r.title,
    styleBlock: r.style_block,
    access,
  };
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
  return loadInjection(INJECTION_BY_MENTION_SQL, userId, mention);
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
  return loadInjection(INJECTION_BY_ID_SQL, userId, id);
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
    .select({
      id: userTextForms.id,
      kind: userTextForms.kind,
      share_mode: userTextForms.share_mode,
      is_public: userTextForms.is_public,
      public_ownership: userTextForms.public_ownership,
    })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);
  const row = existing[0];
  if (!row) return { ok: true, updated: false };
  // Nicht nur `kind`: eine `custom`-Zeile, deren Mention ein Systemrezept
  // verdeckt, tauschte es für alle aus, die sie bekämen (siehe
  // `isShareableTextForm`). Der Grund heisst weiter `not_custom` — der Router
  // bildet ihn auf 409 ab und der Text passt auf beide Fälle.
  if (!isShareableTextForm(row.kind as TextFormKind, mention)) {
    return { ok: false, reason: 'not_custom' };
  }

  // The patch is resolved against the stored row, not applied field by field:
  // a caller that only flips `share_mode` still has to leave a consistent
  // triple behind, and only this function sees both halves.
  const verdict = applySharingPatch(
    {
      share_mode: row.share_mode as TextFormShareMode,
      is_public: row.is_public,
      public_ownership: (row.public_ownership as PublicOwnership | null) ?? null,
    },
    patch
  );
  if (!verdict.ok) return verdict;

  const updated = await db
    .update(userTextForms)
    .set({
      share_mode: verdict.next.share_mode,
      is_public: verdict.next.is_public,
      public_ownership: verdict.next.public_ownership,
      updated_at: new Date(),
    })
    .where(eq(userTextForms.id, row.id))
    .returning({ id: userTextForms.id });

  return { ok: true, updated: updated.length > 0 };
}

/** The row `mention` names for its owner, whatever kind it is. The kind gate
 * belongs to the callers: sharing is gated, revoking deliberately is not. */
async function findOwnRow(
  userId: string,
  mention: string
): Promise<{ id: string; kind: string } | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: userTextForms.id, kind: userTextForms.kind })
    .from(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .limit(1);
  const row = rows[0];
  return row ? { id: String(row.id), kind: row.kind } : null;
}

/** Share a recipe the user owns with one of their groups. Only Zeilen, die
 * `isShareableTextForm` durchlässt: ein Preset, ein Rezept-Stil und eine
 * `custom`-Zeile auf der Mention eines Systemrezepts nehmen denselben Weg wie
 * eine fehlende Zeile. */
export async function shareTextFormWithGroup(
  userId: string,
  mention: string,
  groupId: string
): Promise<TextFormGroupShare[] | null> {
  const form = await findOwnRow(userId, mention);
  if (!form || !isShareableTextForm(form.kind as TextFormKind, mention)) return null;

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

  const shares = await loadSharesFor([form.id]);
  return shares.get(form.id) ?? [];
}

/**
 * Revoke a group share. Deliberately NOT gated on `kind = 'custom'`, unlike
 * `shareTextFormWithGroup`: shares of preset and recipe rows exist from before
 * that gate, `GROUP_SHARE_EXISTS` still injects them, and a gate here would
 * leave their owner no way to take them back. Taking access away is always
 * allowed; only handing it out is restricted.
 */
export async function unshareTextFormFromGroup(
  userId: string,
  mention: string,
  groupId: string
): Promise<TextFormGroupShare[] | null> {
  const form = await findOwnRow(userId, mention);
  if (!form) return null;

  const pg = getPostgresInstance();
  await pg.query(
    `DELETE FROM group_content_shares
      WHERE content_type = $1 AND content_id = $2 AND group_id = $3::uuid`,
    [TEXT_FORM_CONTENT_TYPE, form.id, groupId]
  );

  const shares = await loadSharesFor([form.id]);
  return shares.get(form.id) ?? [];
}

/**
 * Was eine optionale Spalte im Konflikt-Zweig eines Upserts trägt: `undefined`
 * behält den gespeicherten Wert (`stored`), `null` leert, ein Wert ersetzt.
 *
 * Nötig, weil nicht jeder Schreiber alle Felder kennt: `recipes.add_examples`
 * und der ausgelieferte Agentura-Editor senden weder `description` noch
 * `iconKey`. Ein bedingungsloses `input.description ?? null` im `set` löschte
 * beides bei jedem Nachschieben von Beispielen (#3472) — genau die Felder, die
 * ein Rezept in der Agentura auffindbar machen.
 *
 * `stored` ist am Aufrufort die Spaltenreferenz selbst, damit Postgres den alten
 * Wert einsetzt und niemand ihn vorher lesen muss (ein Lesen davor wäre ein
 * Rennen gegen den parallelen Schreiber). Die Entscheidung bleibt trotzdem rein
 * und ohne Postgres prüfbar.
 */
export function mergeOptionalColumn<TValue, TStored>(
  input: TValue | null | undefined,
  stored: TStored
): TValue | TStored | null {
  return input === undefined ? stored : input;
}

/**
 * Create or replace the caller's recipe under `mention`.
 *
 * `share_mode`, `is_public` and `public_ownership` are NOT in the conflict set:
 * they are bound to the row, not to its content — exactly as for user agents,
 * where `public_ownership` is a legal attestation about THIS row. An edit must
 * not silently re-publish a recipe the owner un-published, nor carry an old
 * attestation over to new content.
 *
 * `description` und `icon_key` stehen zwar im `set`, aber über
 * {@link mergeOptionalColumn}: wer sie nicht mitschickt, ändert sie nicht.
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
        description: mergeOptionalColumn(input.description, sql`${userTextForms.description}`),
        icon_key: mergeOptionalColumn(input.iconKey, sql`${userTextForms.icon_key}`),
        analyzed_at: values.analyzed_at,
        updated_at: values.updated_at,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to upsert text form');
  return rowToTextForm(row);
}

export async function deleteTextForm(userId: string, mention: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .delete(userTextForms)
    .where(and(eq(userTextForms.user_id, userId), eq(userTextForms.mention, mention)))
    .returning({ id: userTextForms.id });
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
 * separate menu entries — except when no system recipe exists (`antrag`). Die
 * Regel steht als {@link isListableTextForm} daneben, weil dieselbe Frage auch
 * ausserhalb dieser Abfrage gestellt wird (#2937).
 *
 * `includePublic: false` lässt den offenen Katalog weg — für Aufrufer, die eine
 * AUFZÄHLUNG bauen, deren Länge etwas kostet (der Rezept-Katalog des Modells).
 * Ein öffentliches Rezept bleibt dabei erreichbar: über die ausdrückliche
 * Mention und die Auswahl im Composer. Das `recipes`-Werkzeug zählt es NICHT
 * auf — es liest dieselben Quellen wie der Katalog.
 */
export async function listMentionableTextForms(
  userId: string,
  limit = 200,
  opts: { includePublic?: boolean } = {}
): Promise<MentionableTextForm[]> {
  const includePublic = opts.includePublic ?? true;
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
      WHERE ${includePublic ? VISIBLE_TO_CALLER : VISIBLE_TO_CALLER_NO_PUBLIC}
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
    const kind = winner.kind as TextFormKind;
    if (!isListableTextForm(kind, winner.mention)) continue;
    out.push({
      id: String(winner.id),
      mention: winner.mention,
      title: winner.title,
      description: winner.description ?? null,
      iconKey: winner.icon_key ?? null,
      kind,
      sharedFromGroup: winner.access === 'group' ? (winner.group_name ?? null) : null,
      ownerName: winner.access === 'own' ? null : (winner.owner_name ?? null),
      isPublic: winner.is_public,
    });
  }
  return out;
}
