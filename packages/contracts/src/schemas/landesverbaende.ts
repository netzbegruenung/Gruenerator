/**
 * Zod schemas for the Landesverband tenant model — shared by the
 * lvAdminAssignmentContract (Hauptgrünerator-Super-Admin) and, from PR 2 on,
 * landesverbandAdminContract (LV-self-service). `email_domains` is only a
 * verification signal surfaced in the admin UI — it never determines the
 * `landesverband_id` assignment itself, which is derived server-side from
 * the user's self-reported role (see LandesverbandDerivationService).
 */
import { z } from 'zod';

export const landesverbandCountrySchema = z.enum(['DE', 'AT']);

export const landesverbandSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  country: landesverbandCountrySchema,
  emailDomains: z.array(z.string()),
  adminCount: z.number(),
});

export const landesverbandListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(landesverbandSummarySchema),
});

export const landesverbandSuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const landesverbandErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const updateLandesverbandBodySchema = z.object({
  name: z.string().min(1).optional(),
  emailDomains: z.array(z.string()).optional(),
});

export const landesverbandAdminEntrySchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  assignedBy: z.string().nullable(),
  assignedAt: z.string(),
});

export const landesverbandAdminListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(landesverbandAdminEntrySchema),
});

export const assignLandesverbandAdminBodySchema = z.object({
  email: z.string().email(),
});
