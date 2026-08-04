/**
 * Zod schemas for Rezepte (skill) visibility endpoints — the public read used
 * by every discovery surface, and the admin-gated list/toggle used to curate
 * per-deployment. Mirrors apps/api/routes/skills/skillVisibilityContractRouter.ts.
 *
 * Keyed by `mention` (e.g. 'presse'), not a skill's `identifier` — the
 * identifier is the owning agent and is shared across several Rezepte (18
 * skills share 8 identifiers), so it can't address a single one.
 */
import { z } from 'zod';

// ── Response schemas ─────────────────────────────────────────────────────────

export const skillVisibilityResponseSchema = z.object({
  hiddenMentions: z.array(z.string()),
});

export const adminSkillEntrySchema = z.object({
  mention: z.string(),
  identifier: z.string(),
  title: z.string(),
  skillCategory: z.string().nullable(),
  hidden: z.boolean(),
});

export const adminSkillListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(adminSkillEntrySchema),
});

export const adminSkillSuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const adminSkillErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ── Request bodies ───────────────────────────────────────────────────────────

export const setSkillHiddenBodySchema = z.object({
  hidden: z.boolean(),
});
