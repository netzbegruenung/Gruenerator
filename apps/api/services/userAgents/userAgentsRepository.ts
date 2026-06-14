/**
 * User Agents Repository
 *
 * CRUD for per-user agent customisations stored in `user_agents`. The row is
 * converted to the camelCase `Agent` shape from `@gruenerator/shared/agents`
 * at the boundary so the rest of the stack handles a single canonical type.
 */

import { type Agent, type AgentProvider } from '@gruenerator/shared/agents';
import { and, eq } from 'drizzle-orm';

import { userAgents, type UserAgentRow } from '../../database/schema/userAgents.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

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
