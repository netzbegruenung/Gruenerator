/**
 * Zod schemas for user-created agent CRUD endpoints.
 * Mirrors apps/api/routes/userAgents/userAgentsContractRouter.ts.
 *
 * Source of truth for the /api/user-agents request/response shapes. The
 * response `agent` mirrors the serializable subset of the canonical `Agent`
 * type (`@gruenerator/shared/agents`) that `rowToAgent` emits.
 *
 * NOTE on `enabledTools`: kept a free string array, NOT a z.enum. The closed
 * set lives in `@gruenerator/shared` (USER_SELECTABLE_TOOLS); this package is
 * intentionally dependency-light and cannot import it. The server router
 * validates membership against that catalog at the boundary.
 */
import { z } from 'zod';

// ── Closed sets ──────────────────────────────────────────────────────────────

/** Matches `AgentProvider` in @gruenerator/shared/agents. */
export const agentProviderSchema = z.enum(['mistral', 'anthropic', 'litellm', 'regolo']);

// ── Shared shapes ──────────────────────────────────────────────────────────────

export const agentParamsSchema = z.object({
  max_tokens: z.number().int().min(100).max(8000),
  temperature: z.number().min(0).max(1),
});

export const agentFewShotExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  reasoning: z.string().optional(),
});

export type AgentFewShotExample = z.infer<typeof agentFewShotExampleSchema>;

/** Slug identifier: lowercase, digits, dashes. */
const identifierSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche erlaubt');

// ── Response item ──────────────────────────────────────────────────────────────

/**
 * The serializable Agent shape returned by the user-agents endpoints. Optional
 * fields are present only when set on the row (rowToAgent uses conditional
 * spreads), so `.optional()` — not `.nullable()` — is correct here.
 */
// Array fields are `.readonly()` so the inferred type matches the canonical
// `Agent` (whose arrays are `readonly string[]`) in both directions — the
// server can return an `Agent` and the frontend can hand `body.agents` back as
// `Agent[]`, both without a cast.
export const userAgentSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  description: z.string(),
  systemRole: z.string(),
  avatar: z.string(),
  backgroundColor: z.string(),
  tags: z.array(z.string()).readonly(),
  model: z.string(),
  defaultModel: z.string().optional(),
  provider: agentProviderSchema,
  params: agentParamsSchema,
  openingMessage: z.string(),
  openingQuestions: z.array(z.string()).readonly(),
  locale: z.string(),
  author: z.string(),
  defaultNotebookId: z.string().optional(),
  plugins: z.array(z.string()).readonly().optional(),
  enabledTools: z.array(z.string()).readonly().optional(),
  skillMentions: z.array(z.string()).readonly().optional(),
  fewShotExamples: z.array(agentFewShotExampleSchema).readonly().optional(),
});

export type UserAgent = z.infer<typeof userAgentSchema>;

// ── Request bodies ───────────────────────────────────────────────────────────

export const createUserAgentBodySchema = z.object({
  identifier: identifierSchema,
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  systemRole: z.string().min(10),
  avatar: z.string().min(1).max(8),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  tags: z.array(z.string()).default([]),
  model: z.string().default('mistral-large-latest'),
  defaultModel: z.string().nullish(),
  provider: agentProviderSchema.default('mistral'),
  params: agentParamsSchema.default({ max_tokens: 3000, temperature: 0.5 }),
  openingMessage: z.string().default(''),
  openingQuestions: z.array(z.string()).default([]),
  locale: z.string().default('de-DE'),
  author: z.string().default('Eigene*r Agent*in'),
  defaultNotebookId: z.string().nullish(),
  plugins: z.array(z.string()).nullish(),
  enabledTools: z.array(z.string()).nullish(),
  skillMentions: z.array(z.string()).nullish(),
  fewShotExamples: z.array(agentFewShotExampleSchema).nullish(),
});

export type CreateUserAgentBody = z.infer<typeof createUserAgentBodySchema>;

/** Patch: every field optional except `identifier`, which is immutable. */
export const updateUserAgentBodySchema = createUserAgentBodySchema.partial().omit({
  identifier: true,
});

export type UpdateUserAgentBody = z.infer<typeof updateUserAgentBodySchema>;

// ── Response wrappers ──────────────────────────────────────────────────────────

export const userAgentsListResponseSchema = z.object({
  success: z.boolean(),
  agents: z.array(userAgentSchema),
});

export const userAgentItemResponseSchema = z.object({
  success: z.boolean(),
  agent: userAgentSchema,
});

export const userAgentDeleteResponseSchema = z.object({
  success: z.boolean(),
});

/**
 * Error body. `agent` is optional because the convert-cg conflict (409)
 * returns the already-converted agent alongside the message.
 */
export const userAgentErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  agent: userAgentSchema.optional(),
});
