/**
 * Zod schema for the frontmatter of a markdown-defined system skill.
 *
 * Mirrors the runtime shape of `Skill` (packages/shared/src/agents/types.ts).
 * Frontmatter is the *whole* public file: the prompt body is party-internal,
 * lives outside this repo and is served at runtime by the API — see
 * `skillPromptResponseSchema` below and apps/api/services/skills/
 * internalPrompts.ts. Used by `packages/shared/scripts/build-skills.ts`
 * to validate every `*.md` skill file before emitting `index.generated.ts`.
 *
 * Identifier values are TS-narrowed to `SystemAgentId` at codegen time via
 * the `satisfies SystemSkill` cast in the generated file, so the Zod side
 * only validates that the field is a non-empty string.
 */
import { z } from 'zod';

export const skillCategorySchema = z.enum([
  'presse',
  'social',
  'dokumente',
  'recherche',
  'sonstiges',
]);

export const skillFrontmatterSchema = z.object({
  identifier: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  iconKey: z.string().min(1),
  avatar: z.string().min(1),
  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{3,8}$/, 'backgroundColor must be a hex colour like #316049'),
  mention: z
    .string()
    .min(1)
    .regex(/^[a-z0-9äöüß-]+$/, 'mention must be lowercase letters, digits, hyphens (umlauts ok)'),
  skillCategory: skillCategorySchema.optional(),
  /** Locale visibility, same semantics as agents: de-DE / de-AT / all (default). */
  audience: z.enum(['de-DE', 'de-AT', 'all']).optional(),
  promptTemplate: z.string().min(1).optional(),
  isSystemDefault: z.boolean().optional(),
  /**
   * Numeric ordering hint for the generated SKILLS array. Lower wins. Ties
   * break alphabetically by `mention`. When omitted, the skill sorts after
   * everything with an explicit order, then alphabetically within its
   * category. Used to preserve the curated "base skills first, then per-LV
   * groups" registry ordering after migration.
   */
  order: z.number().int().optional(),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
export type SkillCategoryValue = z.infer<typeof skillCategorySchema>;

/**
 * The party-internal prompt body of one skill, fetched by the Agentura recipe
 * detail view. Deliberately not part of `SKILLS`: that array is bundled into
 * the web and mobile clients and would publish every prompt to anyone who
 * opens the JS chunk. Behind `requireAuth`.
 *
 * `prompt: null` is the normal degraded answer, not an error — it means the
 * internal directory was not rolled out on this host (a fork, a fresh clone, a
 * failed Salt run). The UI falls back to the skill's public description.
 */
export const skillPromptResponseSchema = z.object({
  mention: z.string().min(1),
  prompt: z.string().nullable(),
});

export const skillPromptErrorResponseSchema = z.object({
  error: z.string(),
});

export type SkillPromptResponse = z.infer<typeof skillPromptResponseSchema>;
