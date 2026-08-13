/**
 * Zod schemas for the Hauptgrünerator-Super-Admin's paginated, searchable
 * user picker (used to assign someone as a Landesverband-Admin). Fields are
 * kept deliberately minimal — no chat content, no unrelated profile data —
 * per the data-minimalism requirement on every admin-facing user list.
 */
import { z } from 'zod';

export const adminUserSummarySchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  isAdmin: z.boolean(),
  joinedAt: z.string().nullable(),
});

export const adminUserSearchResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(adminUserSummarySchema),
  nextCursor: z.string().nullable(),
});

export const adminUserSearchErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
