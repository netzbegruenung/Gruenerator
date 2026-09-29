/**
 * User Agents Repository
 *
 * CRUD for per-user agent customisations stored in `user_agents`. The row is
 * converted to the camelCase `Agent` shape from `@gruenerator/shared/agents`
 * at the boundary so the rest of the stack handles a single canonical type.
 */

import { type Agent, type AgentProvider } from '@gruenerator/shared/agents';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { userAgents, type UserAgentRow } from '../../database/schema/userAgents.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { notTrashed } from '../../database/trash.js';
import { deleteTrashedRow, type OwnedTrashTable } from '../trash/ownedRowTrash.js';

import { isUserAgentId } from './userAgentHandle.js';

export interface UserAgentInput {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  iconKey?: string;
  backgroundColor: string;
  tags: string[];
  model: string;
  defaultModel?: string | null;
  provider: AgentProvider;
  params: { max_tokens: number; temperature: number };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  defaultNotebookIds?: string[] | null;
  plugins?: string[];
  enabledTools?: string[];
  skillMentions?: string[];
  fewShotExamples?: Array<{ input: string; output: string; reasoning?: string }>;
  inlineSourceLinks?: boolean;
  defaultRecipeMention?: string | null;
  defaultRecipeId?: string | null;
}

export type UserAgentPatch = Partial<UserAgentInput>;

// snake_case row → camelCase Agent. Boundary cast: DB layer is untyped jsonb
// at runtime; Drizzle gives us $type<…> hints but TS treats them as nullable
// by default for jsonb without a default.
/** A user agent as it leaves this module: an `Agent` that always carries its row `id`. */
export type UserAgentRecord = Agent & { id: string };

function rowToAgent(row: UserAgentRow): UserAgentRecord {
  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    systemRole: row.system_role,
    avatar: row.avatar,
    backgroundColor: row.background_color,
    tags: row.tags,
    model: row.model,
    provider: row.provider as AgentProvider,
    params: row.params,
    openingMessage: row.opening_message,
    openingQuestions: row.opening_questions,
    locale: row.locale,
    author: row.author,
    ...(row.icon_key ? { iconKey: row.icon_key } : {}),
    ...(row.default_model ? { defaultModel: row.default_model } : {}),
    ...(row.default_notebook_ids?.length ? { defaultNotebookIds: row.default_notebook_ids } : {}),
    ...(row.plugins ? { plugins: row.plugins } : {}),
    ...(row.enabled_tools ? { enabledTools: row.enabled_tools } : {}),
    ...(row.skill_mentions ? { skillMentions: row.skill_mentions } : {}),
    ...(row.few_shot_examples ? { fewShotExamples: row.few_shot_examples } : {}),
    ...(row.inline_source_links != null ? { inlineSourceLinks: row.inline_source_links } : {}),
    ...(row.default_recipe_mention ? { defaultRecipeMention: row.default_recipe_mention } : {}),
    ...(row.default_recipe_id ? { defaultRecipeId: row.default_recipe_id } : {}),
  };
}

function inputToInsertValues(userId: string, input: UserAgentInput) {
  return {
    user_id: userId,
    identifier: input.identifier,
    title: input.title,
    description: input.description,
    system_role: input.systemRole,
    avatar: input.avatar,
    icon_key: input.iconKey ?? null,
    background_color: input.backgroundColor,
    tags: input.tags,
    model: input.model,
    default_model: input.defaultModel ?? null,
    provider: input.provider,
    params: input.params,
    opening_message: input.openingMessage,
    opening_questions: input.openingQuestions,
    locale: input.locale,
    author: input.author,
    default_notebook_ids: input.defaultNotebookIds ?? null,
    plugins: input.plugins ?? null,
    enabled_tools: input.enabledTools ?? null,
    skill_mentions: input.skillMentions ?? null,
    few_shot_examples: input.fewShotExamples ?? null,
    inline_source_links: input.inlineSourceLinks ?? null,
    default_recipe_mention: input.defaultRecipeMention ?? null,
    default_recipe_id: input.defaultRecipeId ?? null,
  };
}

function patchToUpdateValues(patch: UserAgentPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { updated_at: new Date() };
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.systemRole !== undefined) out.system_role = patch.systemRole;
  if (patch.avatar !== undefined) out.avatar = patch.avatar;
  if (patch.iconKey !== undefined) out.icon_key = patch.iconKey;
  if (patch.backgroundColor !== undefined) out.background_color = patch.backgroundColor;
  if (patch.tags !== undefined) out.tags = patch.tags;
  if (patch.model !== undefined) out.model = patch.model;
  if (patch.defaultModel !== undefined) out.default_model = patch.defaultModel;
  if (patch.provider !== undefined) out.provider = patch.provider;
  if (patch.params !== undefined) out.params = patch.params;
  if (patch.openingMessage !== undefined) out.opening_message = patch.openingMessage;
  if (patch.openingQuestions !== undefined) out.opening_questions = patch.openingQuestions;
  if (patch.locale !== undefined) out.locale = patch.locale;
  if (patch.author !== undefined) out.author = patch.author;
  if (patch.defaultNotebookIds !== undefined) out.default_notebook_ids = patch.defaultNotebookIds;
  if (patch.plugins !== undefined) out.plugins = patch.plugins;
  if (patch.enabledTools !== undefined) out.enabled_tools = patch.enabledTools;
  if (patch.skillMentions !== undefined) out.skill_mentions = patch.skillMentions;
  if (patch.fewShotExamples !== undefined) out.few_shot_examples = patch.fewShotExamples;
  if (patch.inlineSourceLinks !== undefined) out.inline_source_links = patch.inlineSourceLinks;
  if (patch.defaultRecipeMention !== undefined)
    out.default_recipe_mention = patch.defaultRecipeMention;
  if (patch.defaultRecipeId !== undefined) out.default_recipe_id = patch.defaultRecipeId;
  return out;
}

/** The caller's own agent by handle — its row uuid or its identifier. */
function ownedByHandle(userId: string, handle: string) {
  return and(
    eq(userAgents.user_id, userId),
    isUserAgentId(handle) ? eq(userAgents.id, handle) : eq(userAgents.identifier, handle)
  );
}

export async function listUserAgents(userId: string): Promise<UserAgentRecord[]> {
  const db = getDrizzleInstance();
  const agentRows = await db
    .select()
    .from(userAgents)
    .where(and(eq(userAgents.user_id, userId), notTrashed(userAgents)));
  return agentRows.map(rowToAgent);
}

export async function getUserAgent(
  userId: string,
  handle: string
): Promise<UserAgentRecord | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userAgents)
    .where(and(ownedByHandle(userId, handle), notTrashed(userAgents)))
    .limit(1);
  const row = rows[0];
  return row ? rowToAgent(row) : undefined;
}

export async function createUserAgent(
  userId: string,
  input: UserAgentInput
): Promise<UserAgentRecord> {
  // Every handle that looks like a uuid is read as one; an identifier of that
  // shape would be unreachable. The HTTP contract refuses it too — this covers
  // the chat tool and MCP create paths.
  if (isUserAgentId(input.identifier)) {
    throw new Error('Der Bezeichner darf nicht wie eine UUID aussehen.');
  }
  const db = getDrizzleInstance();
  const rows = await db.insert(userAgents).values(inputToInsertValues(userId, input)).returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to insert user agent');
  return rowToAgent(row);
}

export async function updateUserAgent(
  userId: string,
  handle: string,
  patch: UserAgentPatch
): Promise<UserAgentRecord | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .update(userAgents)
    .set(patchToUpdateValues(patch))
    .where(and(ownedByHandle(userId, handle), notTrashed(userAgents)))
    .returning();
  const row = rows[0];
  return row ? rowToAgent(row) : undefined;
}

/**
 * Move the caller's agent to the Papierkorb: only `deleted_at` is set, its
 * group shares stay and grant nothing while every reader filters the row.
 * Owner only — the same check restore and purge-now ask.
 */
export async function deleteUserAgent(userId: string, handle: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .update(userAgents)
    .set({ deleted_at: new Date() })
    .where(and(ownedByHandle(userId, handle), notTrashed(userAgents)))
    .returning({ id: userAgents.id });
  return rows.length > 0;
}

/**
 * `(user_id, identifier)` is unique among live rows only: a restore next to a
 * newer agent with the same identifier answers `conflict`.
 */
export const USER_AGENT_TRASH: OwnedTrashTable = { table: 'user_agents', columns: 'id, title' };

/** Hard-delete a trashed agent. Its `group_content_shares` rows were never removed on delete either. */
export async function purgeUserAgent(id: string, cutoff: Date | null): Promise<boolean> {
  return (await deleteTrashedRow(USER_AGENT_TRASH, id, cutoff)) !== null;
}

// ── Sharing ────────────────────────────────────────────────────────────────
// share_mode gates who can see/use the agent; is_public lists it in the public
// Agentura directory atop share_mode='authenticated'; `locale` doubles as the
// audience filter. Group shares live in the polymorphic group_content_shares
// table keyed by the agent's UUID `id` (content_id), not the per-user
// `identifier`. See migrations/user_agents_sharing_columns.sql.
//
// A share row alone grants nothing: every group-share reader also requires
// `share_mode <> 'private'`, so setting an agent back to private revokes group
// access without deleting the rows — switching back to 'groups' restores them,
// and the sharing panel (which lists shares only in 'groups' mode) never hides
// a share that still works. The share paths promote 'private' to 'groups'
// before they insert (`shareContentToGroup`, `addGroupShare`).

export type UserAgentAudience = 'de-DE' | 'de-AT';
export type UserAgentShareMode = 'private' | 'groups' | 'authenticated';
export type UserAgentPublicOwnership = 'owner' | 'public_data';

export interface UserAgentSharing {
  /** The agent's UUID — the group_content_shares.content_id for this agent. */
  id: string;
  share_mode: UserAgentShareMode;
  audience: UserAgentAudience;
  is_public: boolean;
  public_ownership: UserAgentPublicOwnership | null;
}

export interface UserAgentSharingPatch {
  share_mode?: UserAgentShareMode;
  audience?: UserAgentAudience;
  is_public?: boolean;
  public_ownership?: UserAgentPublicOwnership | null;
}

function normalizeAudience(locale: string): UserAgentAudience {
  return locale === 'de-AT' ? 'de-AT' : 'de-DE';
}

/** Owner-scoped lookup of an agent's sharing state (and its UUID). */
export async function getAgentSharing(
  userId: string,
  handle: string
): Promise<UserAgentSharing | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      id: userAgents.id,
      share_mode: userAgents.share_mode,
      locale: userAgents.locale,
      is_public: userAgents.is_public,
      public_ownership: userAgents.public_ownership,
    })
    .from(userAgents)
    .where(and(ownedByHandle(userId, handle), notTrashed(userAgents)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    share_mode: row.share_mode as UserAgentShareMode,
    audience: normalizeAudience(row.locale),
    is_public: row.is_public,
    public_ownership: (row.public_ownership as UserAgentPublicOwnership | null) ?? null,
  };
}

/** Owner-scoped update of sharing fields. `audience` writes the `locale` column. */
export async function updateAgentSharing(
  userId: string,
  handle: string,
  patch: UserAgentSharingPatch
): Promise<boolean> {
  const db = getDrizzleInstance();
  const values: Record<string, unknown> = { updated_at: new Date() };
  if (patch.share_mode !== undefined) values.share_mode = patch.share_mode;
  if (patch.audience !== undefined) values.locale = patch.audience;
  if (patch.is_public !== undefined) values.is_public = patch.is_public;
  if (patch.public_ownership !== undefined) values.public_ownership = patch.public_ownership;
  const rows = await db
    .update(userAgents)
    .set(values)
    .where(and(ownedByHandle(userId, handle), notTrashed(userAgents)))
    .returning({ id: userAgents.id });
  return rows.length > 0;
}

/**
 * Hydrate agents by UUID — used by the group-content read path. The UUID `id`
 * is carried alongside the Agent shape so the caller can match each agent back
 * to its group_content_shares row (content_id = the UUID).
 *
 * Without `systemRole`: every member of the group reads this bucket, and a
 * group share lets a teammate USE an agent, not read its prompt (#3781) —
 * same policy as `listMentionableUserAgents`.
 */
export async function listUserAgentsByIds(
  ids: string[]
): Promise<Array<Omit<UserAgentRecord, 'systemRole'>>> {
  if (ids.length === 0) return [];
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userAgents)
    .where(
      and(inArray(userAgents.id, ids), ne(userAgents.share_mode, 'private'), notTrashed(userAgents))
    );
  return rows.map((row) => {
    const { systemRole: _systemRole, ...agent } = rowToAgent(row);
    return agent;
  });
}

/**
 * Resolve an agent by `identifier` for a requester who is NOT its owner but is
 * an active member of a group the agent has been shared into (the dedicated
 * `addGroupShare` flow inserts a `group_content_shares` row keyed by the
 * agent's UUID `id`). This is what lets group members chat with an agent a
 * teammate built. Returns undefined unless such an active-membership share
 * exists and the agent is not private.
 *
 * `group_content_shares` has no Drizzle table, so the EXISTS join uses the raw
 * Postgres accessor; the matched row is mapped through the same `rowToAgent`
 * boundary as the owner-scoped lookups. `content_id` is TEXT, so the UUID is
 * cast to text for the comparison.
 *
 * `identifier` is unique per OWNER, not globally, so two people in the same
 * group may both have shared a `klima-gruenerator` and the `LIMIT 1` has to
 * pick one. It orders by creation to pick the same one every time —
 * `listMentionableUserAgents` repeats this order so the picker offers the agent
 * this function will load, not another one under the same name.
 */
export async function getGroupSharedUserAgent(
  identifier: string,
  requestingUserId: string
): Promise<UserAgentRecord | undefined> {
  const postgres = getPostgresInstance();
  const row = await postgres.queryOne<UserAgentRow>(
    `SELECT ua.*
       FROM user_agents ua
      WHERE ua.identifier = $1
        AND ua.share_mode <> 'private'
        AND ua.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
            FROM group_content_shares gcs
            JOIN group_memberships gm ON gm.group_id = gcs.group_id
            INNER JOIN groups lg ON lg.id = gm.group_id AND lg.deleted_at IS NULL
           WHERE gcs.content_type = 'user_agents'
             AND gcs.content_id = ua.id::text
             AND gm.user_id = $2
             AND gm.is_active = true
        )
      ORDER BY ua.created_at, ua.id
      LIMIT 1`,
    [identifier, requestingUserId],
    { table: 'user_agents' }
  );
  return row ? rowToAgent(row) : undefined;
}

/**
 * Last rung of the ladder: an agent whose owner opened it to every signed-in
 * user. `share_mode` is the access check — it is what `setShareMode` gates on —
 * while `is_public` only decides whether the agent is ALSO listed in the
 * Agentura community shelf. So this deliberately does not filter on
 * `is_public`: an agent opened to all but not listed is still usable, which is
 * what 'authenticated' means.
 *
 * It also does not filter on locale. Locale narrows DISCOVERY
 * (`listPublicUserAgents`); someone opening one specific agent has already
 * found it, and filtering here would hide a German agent from an Austrian
 * account that was handed the link.
 *
 * `identifier` is unique per OWNER, not globally, so the `LIMIT 1` has to pick
 * one — same `created_at, id` order as `getGroupSharedUserAgent`, so the choice
 * is stable across calls rather than left to the planner.
 */
export async function getPublicUserAgent(identifier: string): Promise<UserAgentRecord | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userAgents)
    .where(
      and(
        eq(userAgents.identifier, identifier),
        eq(userAgents.share_mode, 'authenticated'),
        notTrashed(userAgents)
      )
    )
    .orderBy(userAgents.created_at, userAgents.id)
    .limit(1);
  const row = rows[0];
  return row ? rowToAgent(row) : undefined;
}

/**
 * An agent by its row uuid, if the caller may use it: they own it, it is
 * shared into a group they are an active member of, or its owner opened it to
 * every signed-in user. The same three checks as the identifier ladder above,
 * in one query — a uuid names one row, so there is nothing to rank.
 */
export async function getAccessibleUserAgentById(
  id: string,
  requestingUserId: string
): Promise<UserAgentRecord | undefined> {
  const postgres = getPostgresInstance();
  const row = await postgres.queryOne<UserAgentRow>(
    `SELECT ua.*
       FROM user_agents ua
      WHERE ua.id = $1::uuid
        AND ua.deleted_at IS NULL
        AND (
          ua.user_id = $2::uuid
          OR ua.share_mode = 'authenticated'
          OR (
            ua.share_mode <> 'private'
            AND EXISTS (
              SELECT 1
                FROM group_content_shares gcs
                JOIN group_memberships gm ON gm.group_id = gcs.group_id
                INNER JOIN groups lg ON lg.id = gm.group_id AND lg.deleted_at IS NULL
               WHERE gcs.content_type = 'user_agents'
                 AND gcs.content_id = ua.id::text
                 AND gm.user_id = $2
                 AND gm.is_active = true
            )
          )
        )`,
    [id, requestingUserId],
    { table: 'user_agents' }
  );
  return row ? rowToAgent(row) : undefined;
}

/**
 * A picker entry for one agent. `sharedFromGroup` names the group it reached
 * the caller through, `null` for their own.
 */
export interface MentionableUserAgentRow {
  id: string;
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  iconKey?: string;
  backgroundColor: string;
  sharedFromGroup: string | null;
}

const MENTIONABLE_COLUMNS = {
  id: userAgents.id,
  identifier: userAgents.identifier,
  title: userAgents.title,
  description: userAgents.description,
  avatar: userAgents.avatar,
  icon_key: userAgents.icon_key,
  background_color: userAgents.background_color,
} as const;

type MentionableColumns = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  icon_key: string | null;
  background_color: string;
};

function toMentionable(
  row: MentionableColumns,
  sharedFromGroup: string | null
): MentionableUserAgentRow {
  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    avatar: row.avatar,
    ...(row.icon_key ? { iconKey: row.icon_key } : {}),
    backgroundColor: row.background_color,
    sharedFromGroup,
  };
}

/**
 * The agents the caller can name with an `@mention`: their own, plus every
 * agent shared into a group they are an active member of.
 *
 * A lean projection on purpose — the picker needs a label, an icon and the
 * identifier it routes to. `system_role` stays on the server: a group share
 * lets a teammate USE an agent, it is not a licence to read its prompt.
 *
 * Discovery only. `getAgentForUser` already resolved both kinds long before
 * this existed (#2909) — what was missing was a way to find them.
 */
export async function listMentionableUserAgents(
  userId: string
): Promise<MentionableUserAgentRow[]> {
  const db = getDrizzleInstance();
  const ownRows = await db
    .select(MENTIONABLE_COLUMNS)
    .from(userAgents)
    .where(and(eq(userAgents.user_id, userId), notTrashed(userAgents)));
  const own = ownRows.map((row) => toMentionable(row, null));

  // `group_content_shares` has no Drizzle table, so the join uses the raw
  // accessor — same boundary as `getGroupSharedUserAgent` above. `content_id`
  // is TEXT, hence the cast on the UUID.
  //
  // The ORDER BY is load-bearing twice over, and both halves are silent when
  // wrong. `ua.created_at, ua.id` is verbatim the resolver's tie-break, so a
  // colliding identifier resolves to the same agent here and there; `g.name`
  // decides which group an agent shared into SEVERAL of the caller's groups is
  // credited to. Without it Postgres is free to return either, and the sublabel
  // would flip between page loads.
  const pg = getPostgresInstance();
  const sharedRows = (await pg.query(
    `SELECT ua.id, ua.identifier, ua.title, ua.description, ua.avatar, ua.icon_key,
            ua.background_color, g.name AS group_name
       FROM user_agents ua
       INNER JOIN group_content_shares gcs
               ON gcs.content_type = 'user_agents' AND gcs.content_id = ua.id::text
       INNER JOIN groups g ON g.id = gcs.group_id
       INNER JOIN group_memberships gm
               ON gm.group_id = gcs.group_id AND gm.user_id = $1::uuid AND gm.is_active = true
      WHERE ua.user_id <> $1::uuid
        AND ua.share_mode <> 'private'
        AND ua.deleted_at IS NULL
        AND g.deleted_at IS NULL
      ORDER BY ua.created_at, ua.id, g.name`,
    [userId],
    { table: 'user_agents' }
  )) as unknown as Array<MentionableColumns & { group_name: string }>;

  return mergeMentionableAgents(
    own,
    sharedRows.map((row) => toMentionable(row, row.group_name))
  );
}

/**
 * Own agents first, then the group-shared ones an identifier does not already
 * cover. Extracted because the ORDER is the claim: `getAgentForUser` resolves
 * an owned row before it looks at any share, and among shares it takes the
 * oldest — a picker that offered a different agent under the same name would
 * hand the chat something else than it showed. Which share is "first" is the
 * caller's ORDER BY, not this function's; it only keeps the two lists apart.
 */
export function mergeMentionableAgents(
  own: MentionableUserAgentRow[],
  shared: MentionableUserAgentRow[]
): MentionableUserAgentRow[] {
  const seen = new Set(own.map((a) => a.identifier));
  const merged = [...own];
  for (const agent of shared) {
    if (seen.has(agent.identifier)) continue;
    seen.add(agent.identifier);
    merged.push(agent);
  }
  return merged;
}

/**
 * Public Agentura discovery feed: agents listed publicly (is_public=true atop
 * share_mode='authenticated'), filtered to the viewer's locale.
 *
 * One entry per identifier. `identifier` is only unique per owner, so several
 * people publishing the same slug put duplicates into the feed — and every
 * client opens an agent by identifier, so all but one of them would open the
 * one the resolvers pick. Shipped mobile binaries also key cards by it. The
 * viewer's own row wins, then the oldest, as in the resolvers.
 */
export async function listPublicUserAgents(
  viewerId: string,
  viewerLocale: string
): Promise<UserAgentRecord[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userAgents)
    .where(
      and(
        eq(userAgents.is_public, true),
        eq(userAgents.share_mode, 'authenticated'),
        eq(userAgents.locale, normalizeAudience(viewerLocale)),
        notTrashed(userAgents)
      )
    )
    .orderBy(
      desc(sql`${userAgents.user_id} = ${viewerId}`),
      asc(userAgents.created_at),
      asc(userAgents.id)
    );
  const seen = new Set<string>();
  return rows
    .filter((row) => !seen.has(row.identifier) && seen.add(row.identifier))
    .map(rowToAgent);
}
