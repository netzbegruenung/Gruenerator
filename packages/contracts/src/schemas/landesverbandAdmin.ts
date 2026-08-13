/**
 * Zod schemas for the Landesverband-Admin self-service surface (PR 2).
 * Every endpoint is scoped to one `:landesverbandId` and gated by
 * `requireLandesverbandAdmin` — see `landesverbandAdminContract`. Data-minimal
 * user list mirrors `AdminUserTable`'s fixed columns; `emailVerified` is a
 * display-only signal (see LandesverbandDerivationService's email-domain
 * comment), never a write.
 */
import { z } from 'zod';

import { landesverbandCountrySchema } from './landesverbaende.js';

export const landesverbandAdminErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const landesverbandAdminSuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const myLandesverbandScopeSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: landesverbandCountrySchema,
});

export const myLandesverbandScopesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(myLandesverbandScopeSchema),
});

export const landesverbandDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: landesverbandCountrySchema,
  greetingText: z.string().nullable(),
  memberCount: z.number(),
});

export const landesverbandDetailResponseSchema = z.object({
  success: z.boolean(),
  data: landesverbandDetailSchema,
});

export const updateLandesverbandGreetingBodySchema = z.object({
  greetingText: z.string().max(2000).nullable(),
});

export const landesverbandSkillEntrySchema = z.object({
  mention: z.string(),
  title: z.string(),
  skillCategory: z.string().nullable(),
  hiddenGlobally: z.boolean(),
  hiddenForLv: z.boolean(),
});

export const landesverbandSkillsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(landesverbandSkillEntrySchema),
});

export const setLandesverbandSkillHiddenBodySchema = z.object({
  hidden: z.boolean(),
});

export const landesverbandUserSummarySchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  joinedAt: z.string().nullable(),
  emailVerified: z.boolean(),
});

export const landesverbandUsersResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(landesverbandUserSummarySchema),
});
