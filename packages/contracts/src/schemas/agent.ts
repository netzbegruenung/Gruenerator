/**
 * Zod schema for the frontmatter of a markdown-defined system agent.
 *
 * Mirrors the runtime shape of `Agent` (packages/shared/src/agents/types.ts)
 * minus the `systemRole` field — that comes from the markdown body during
 * codegen. Used by `packages/shared/scripts/build-agents.ts` to validate every
 * `definitions/*.md` agent file before emitting `index.generated.ts`.
 *
 * Sibling to `skillFrontmatterSchema` (skill.ts); same migration pattern: the
 * heavy, hard-to-review `systemRole` prompt lives in the markdown body, all
 * structured metadata lives in YAML frontmatter.
 *
 * Identifier values are TS-narrowed to a literal union via the
 * `as const satisfies readonly Agent[]` cast in the generated file, so the Zod
 * side only validates that the field is a non-empty string.
 */
import { z } from 'zod';

const agentAudienceSchema = z.enum(['de-DE', 'de-AT', 'all']);

const agentParamsSchema = z.object({
  max_tokens: z.number(),
  temperature: z.number(),
});

const fewShotExampleSchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  reasoning: z.string().optional(),
});

const toolRestrictionsSchema = z.object({
  allowedCollections: z.array(z.string()).optional(),
  defaultCollection: z.string().optional(),
  examplesCountry: z.enum(['DE', 'AT']).optional(),
  personSearchEnabled: z.boolean().optional(),
  examplesLvScope: z.union([z.string(), z.array(z.string())]).optional(),
  examplesCollection: z.string().optional(),
});

const agentDefaultFilterSchema = z.object({
  landesverband: z.union([z.array(z.string()), z.string()]).optional(),
});

const agentLocalizationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  openingMessage: z.string().optional(),
  welcomeQuestion: z.string().optional(),
  openingQuestions: z.array(z.string()).optional(),
});

export const agentFrontmatterSchema = z.object({
  identifier: z.string().min(1),
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  avatar: z.string().min(1),
  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{3,8}$/, 'backgroundColor must be a hex colour like #316049'),
  tags: z.array(z.string()),
  model: z.string().min(1),
  defaultModel: z.string().min(1).optional(),
  provider: z.enum(['mistral', 'anthropic', 'litellm', 'regolo']),
  params: agentParamsSchema,
  openingMessage: z.string(),
  welcomeQuestion: z.string().optional(),
  openingQuestions: z.array(z.string()),
  locale: z.string().min(1),
  author: z.string().min(1),
  plugins: z.array(z.string()).optional(),
  toolRestrictions: toolRestrictionsSchema.optional(),
  enabledTools: z.array(z.string()).optional(),
  fewShotExamples: z.array(fewShotExampleSchema).optional(),
  routeTo: z.enum(['chat', 'search']).optional(),
  defaultFilter: agentDefaultFilterSchema.optional(),
  hiddenFromInventory: z.boolean().optional(),
  webOnly: z.boolean().optional(),
  defaultNotebookIds: z.array(z.string()).optional(),
  autoRoutingHint: z.enum(['creative', 'precise', 'research']).optional(),
  skillMentions: z.array(z.string()).optional(),
  iconKey: z.string().min(1).optional(),
  pinnedToSidebar: z.boolean().optional(),
  category: z.enum(['gruppen']).optional(),
  audience: agentAudienceSchema.optional(),
  localized: z.record(z.enum(['de-DE', 'de-AT']), agentLocalizationSchema).optional(),
  inlineSourceLinks: z.boolean().optional(),
  /**
   * Numeric ordering hint for the generated registry. Lower wins. Preserves the
   * curated concatenation order (core → öffentlichkeitsarbeit → persona) that
   * the inline files had before migration; the LV-generated agents are appended
   * after these in system.ts. Codegen-only — stripped from the emitted object.
   */
  order: z.number().int().optional(),
});

export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;
