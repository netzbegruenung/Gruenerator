/**
 * Zod schema for the frontmatter of a markdown-defined system skill.
 *
 * Mirrors the runtime shape of `Skill` (packages/shared/src/agents/types.ts)
 * minus the `skillSystemPrompt` field — that comes from the markdown body
 * during codegen. Used by `packages/shared/scripts/build-skills.ts` to
 * validate every `*.md` skill file before emitting `index.generated.ts`.
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
