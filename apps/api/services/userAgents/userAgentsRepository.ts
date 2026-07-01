/**
 * User Agents Repository
 *
 * CRUD for per-user agent customisations stored in `user_agents`. The row is
 * converted to the camelCase `Agent` shape from `@gruenerator/shared/agents`
 * at the boundary so the rest of the stack handles a single canonical type.
 */

import { type Agent, type AgentProvider } from '@gruenerator/shared/agents';
import { and, eq, inArray } from 'drizzle-orm';

import { userAgents, type UserAgentRow } from '../../database/schema/userAgents.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

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
}

export type UserAgentPatch = Partial<UserAgentInput>;

// snake_case row → camelCase Agent. Boundary cast: DB layer is untyped jsonb
// at runtime; Drizzle gives us $type<…> hints but TS treats them as nullable
// by default for jsonb without a default.
function rowToAgent(row: UserAgentRow): Agent {
  return {
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
  return out;
}

export async function listUserAgents(userId: string): Promise<Agent[]> {
  const db = getDrizzleInstance();
  const agentRows = await db.select().from(userAgents).where(eq(userAgents.user_id, userId));
  return agentRows.map(rowToAgent);
}

export async function getUserAgent(userId: string, identifier: string): Promise<Agent | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userAgents)
    .where(and(eq(userAgents.user_id, userId), eq(userAgents.identifier, identifier)))
    .limit(1);
  const row = rows[0];
  return row ? rowToAgent(row) : undefined;
}

export async function createUserAgent(userId: string, input: UserAgentInput): Promise<Agent> {
  const db = getDrizzleInstance();
  const rows = await db.insert(userAgents).values(inputToInsertValues(userId, input)).returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to insert user agent');
  return rowToAgent(row);
}

export async function updateUserAgent(
  userId: string,
  identifier: string,
  patch: UserAgentPatch
): Promise<Agent | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .update(userAgents)
    .set(patchToUpdateValues(patch))
    .where(and(eq(userAgents.user_id, userId), eq(userAgents.identifier, identifier)))
    .returning();
  const row = rows[0];
  return row ? rowToAgent(row) : undefined;
}

export async function deleteUserAgent(userId: string, identifier: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .delete(userAgents)
    .where(and(eq(userAgents.user_id, userId), eq(userAgents.identifier, identifier)))
    .returning({ id: userAgents.id });
  return rows.length > 0;
}

// ── Sharing ────────────────────────────────────────────────────────────────
// share_mode gates who can see/use the agent; is_public lists it in the public
// Agentura directory atop share_mode='authenticated'; `locale` doubles as the
// audience filter. Group shares live in the polymorphic group_content_shares
// table keyed by the agent's UUID `id` (content_id), not the per-user
// `identifier`. See migrations/user_agents_sharing_columns.sql.

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
  identifier: string
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
    .where(and(eq(userAgents.user_id, userId), eq(userAgents.identifier, identifier)))
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
  identifier: string,
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
    .where(and(eq(userAgents.user_id, userId), eq(userAgents.identifier, identifier)))
    .returning({ id: userAgents.id });
  return rows.length > 0;
}

/**
 * Hydrate agents by UUID — used by the group-content read path. The UUID `id`
 * is carried alongside the canonical Agent shape so the caller can match each
 * agent back to its group_content_shares row (content_id = the UUID).
 */
export async function listUserAgentsByIds(ids: string[]): Promise<Array<Agent & { id: string }>> {
  if (ids.length === 0) return [];
  const db = getDrizzleInstance();
  const rows = await db.select().from(userAgents).where(inArray(userAgents.id, ids));
  return rows.map((row) => ({ ...rowToAgent(row), id: row.id }));
}

/**
 * Resolve an agent by `identifier` for a requester who is NOT its owner but is
 * an active member of a group the agent has been shared into (the dedicated
 * `addGroupShare` flow inserts a `group_content_shares` row keyed by the
 * agent's UUID `id`). This is what lets group members chat with an agent a
 * teammate built. Returns undefined unless such an active-membership share
 * exists.
 *
 * `group_content_shares` has no Drizzle table, so the EXISTS join uses the raw
 * Postgres accessor; the matched row is mapped through the same `rowToAgent`
 * boundary as the owner-scoped lookups. `content_id` is TEXT, so the UUID is
 * cast to text for the comparison.
 */
export async function getGroupSharedUserAgent(
  identifier: string,
  requestingUserId: string
): Promise<Agent | undefined> {
  const postgres = getPostgresInstance();
  const row = await postgres.queryOne<UserAgentRow>(
    `SELECT ua.*
       FROM user_agents ua
      WHERE ua.identifier = $1
        AND EXISTS (
          SELECT 1
            FROM group_content_shares gcs
            JOIN group_memberships gm ON gm.group_id = gcs.group_id
           WHERE gcs.content_type = 'user_agents'
             AND gcs.content_id = ua.id::text
             AND gm.user_id = $2
             AND gm.is_active = true
        )
      LIMIT 1`,
    [identifier, requestingUserId],
    { table: 'user_agents' }
  );
  return row ? rowToAgent(row) : undefined;
}

/**
 * Public Agentura discovery feed: agents listed publicly (is_public=true atop
 * share_mode='authenticated'), filtered to the viewer's locale.
 */
export async function listPublicUserAgents(viewerLocale: string): Promise<Agent[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userAgents)
    .where(
      and(
        eq(userAgents.is_public, true),
        eq(userAgents.share_mode, 'authenticated'),
        eq(userAgents.locale, normalizeAudience(viewerLocale))
      )
    );
  return rows.map(rowToAgent);
}
