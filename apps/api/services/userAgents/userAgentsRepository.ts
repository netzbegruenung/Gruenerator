/**
 * User Agents Repository
 *
 * CRUD for per-user agent customisations stored in `user_agents`. The row is
 * converted to the camelCase `Agent` shape from `@gruenerator/shared/agents`
 * at the boundary so the rest of the stack handles a single canonical type.
 */

import { type Agent, type AgentProvider } from '@gruenerator/shared/agents';
import { and, eq } from 'drizzle-orm';

import { customGenerators } from '../../database/schema/generators.js';
import { userAgents, type UserAgentRow } from '../../database/schema/userAgents.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

/**
 * Identifier prefix that namespaces custom_generators virtualized as agents.
 * `cg-<slug>`. Avoids collision with native user-agents (any slug) and system
 * agents (`gruenerator-*`). The agent loader uses this prefix to route lookups
 * back to the custom_generators table.
 */
export const CUSTOM_GENERATOR_AGENT_PREFIX = 'cg-';

interface CustomGeneratorRow {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  prompt: string;
  is_active: boolean;
}

/**
 * Map a custom_generators row to the canonical Agent shape so existing CGs
 * appear as agents in the sidebar without any data migration. system_role is
 * the CG's prompt verbatim; the user provides context conversationally rather
 * than via the legacy form.
 */
function customGeneratorToAgent(row: CustomGeneratorRow): Agent {
  return {
    identifier: `${CUSTOM_GENERATOR_AGENT_PREFIX}${row.slug}`,
    title: row.name,
    description: row.description ?? `Custom Grünerator: ${row.name}`,
    systemRole: row.prompt,
    avatar: '✨',
    backgroundColor: '#316049',
    tags: ['custom'],
    model: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 3000, temperature: 0.6 },
    openingMessage: `Hallo! Ich bin ${row.name}. Wie kann ich helfen?`,
    openingQuestions: [],
    locale: 'de-DE',
    author: 'Custom Grünerator',
  };
}

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
  defaultNotebookId?: string | null;
  plugins?: string[];
  enabledTools?: string[];
  skillMentions?: string[];
  fewShotExamples?: Array<{ input: string; output: string; reasoning?: string }>;
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
    ...(row.default_notebook_id ? { defaultNotebookId: row.default_notebook_id } : {}),
    ...(row.plugins ? { plugins: row.plugins } : {}),
    ...(row.enabled_tools ? { enabledTools: row.enabled_tools } : {}),
    ...(row.skill_mentions ? { skillMentions: row.skill_mentions } : {}),
    ...(row.few_shot_examples ? { fewShotExamples: row.few_shot_examples } : {}),
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
    default_notebook_id: input.defaultNotebookId ?? null,
    plugins: input.plugins ?? null,
    enabled_tools: input.enabledTools ?? null,
    skill_mentions: input.skillMentions ?? null,
    few_shot_examples: input.fewShotExamples ?? null,
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
  if (patch.defaultNotebookId !== undefined) out.default_notebook_id = patch.defaultNotebookId;
  if (patch.plugins !== undefined) out.plugins = patch.plugins;
  if (patch.enabledTools !== undefined) out.enabled_tools = patch.enabledTools;
  if (patch.skillMentions !== undefined) out.skill_mentions = patch.skillMentions;
  if (patch.fewShotExamples !== undefined) out.few_shot_examples = patch.fewShotExamples;
  return out;
}

export async function listUserAgents(userId: string): Promise<Agent[]> {
  const db = getDrizzleInstance();
  const [agentRows, cgRows] = await Promise.all([
    db.select().from(userAgents).where(eq(userAgents.user_id, userId)),
    db
      .select({
        id: customGenerators.id,
        user_id: customGenerators.user_id,
        name: customGenerators.name,
        slug: customGenerators.slug,
        description: customGenerators.description,
        prompt: customGenerators.prompt,
        is_active: customGenerators.is_active,
      })
      .from(customGenerators)
      .where(eq(customGenerators.user_id, userId)),
  ]);
  // If a CG has already been converted (a real user_agents row with identifier
  // `cg-<slug>` exists), skip the virtualized version so it doesn't appear
  // twice in the sidebar.
  const realIdentifiers = new Set(agentRows.map((r) => r.identifier));
  const virtualizedCgs = cgRows
    .filter((cg) => !realIdentifiers.has(`${CUSTOM_GENERATOR_AGENT_PREFIX}${cg.slug}`))
    .map(customGeneratorToAgent);
  return [...agentRows.map(rowToAgent), ...virtualizedCgs];
}

/**
 * Build a UserAgentInput from a custom_generators row. Used by the convert
 * endpoint to persist a virtualized CG as a real user_agents row. Mirrors
 * `customGeneratorToAgent` but produces the camelCase Input shape the
 * repository's `createUserAgent` accepts. Defaults are intentional: anything
 * the user doesn't like is editable on the agent afterwards.
 */
export function customGeneratorToUserAgentInput(row: CustomGeneratorRow): UserAgentInput {
  return {
    identifier: `${CUSTOM_GENERATOR_AGENT_PREFIX}${row.slug}`,
    title: row.name,
    description: row.description ?? `Custom Grünerator: ${row.name}`,
    systemRole: row.prompt,
    avatar: '✨',
    backgroundColor: '#316049',
    tags: ['custom', 'converted'],
    model: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 3000, temperature: 0.6 },
    openingMessage: `Hallo! Ich bin ${row.name}. Wie kann ich helfen?`,
    openingQuestions: [],
    locale: 'de-DE',
    author: 'Custom Grünerator',
    enabledTools: ['search', 'web'],
  };
}

export async function getCustomGeneratorRow(
  userId: string,
  slug: string
): Promise<CustomGeneratorRow | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      id: customGenerators.id,
      user_id: customGenerators.user_id,
      name: customGenerators.name,
      slug: customGenerators.slug,
      description: customGenerators.description,
      prompt: customGenerators.prompt,
      is_active: customGenerators.is_active,
    })
    .from(customGenerators)
    .where(and(eq(customGenerators.user_id, userId), eq(customGenerators.slug, slug)))
    .limit(1);
  return rows[0];
}

export async function getCustomGeneratorAsAgent(
  userId: string,
  slug: string
): Promise<Agent | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      id: customGenerators.id,
      user_id: customGenerators.user_id,
      name: customGenerators.name,
      slug: customGenerators.slug,
      description: customGenerators.description,
      prompt: customGenerators.prompt,
      is_active: customGenerators.is_active,
    })
    .from(customGenerators)
    .where(and(eq(customGenerators.user_id, userId), eq(customGenerators.slug, slug)))
    .limit(1);
  const row = rows[0];
  return row ? customGeneratorToAgent(row) : undefined;
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
