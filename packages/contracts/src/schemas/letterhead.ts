/**
 * Zod schemas for a user's letterheads (Absender for the PDF export).
 *
 * Free text, and the address is multi-line: the renderer's senderLines()
 * splits it on '\n', and real Gliederung addresses ("c/o Kreisgeschäftsstelle",
 * "Stiege 2/Top 5") do not fit a street/zip/city triple.
 *
 * There is no name field — the name is derived from the profile
 * (first_name/last_name, else display_name). A fourth name field would have no
 * rule for which one wins.
 */
import { z } from 'zod';

export const letterheadLabelSchema = z.string().min(1).max(80);
export const letterheadOrganizationSchema = z.string().max(120);
/** Capped at 3 lines so the renderer's 5-line clamp never has to truncate. */
export const letterheadAddressSchema = z
  .string()
  .max(300)
  .refine((v) => v.split('\n').length <= 3, 'höchstens 3 Zeilen');

/**
 * Wie der Brief das Haus verlässt. Die DIN-5008-Geometrie ist für beide Wege
 * dieselbe; unterschiedlich ist nur, ob oben rechts 74 × 40 mm für Freimachung
 * und Matchcode freibleiben müssen. Im Fensterkuvert kommt beides aufs Kuvert,
 * das Blatt darf dort also bedruckt sein.
 */
export const letterheadDispatchModeSchema = z.enum(['fensterkuvert', 'direktfrankierung']);
export type LetterheadDispatchMode = z.infer<typeof letterheadDispatchModeSchema>;

export const letterheadSchema = z.object({
  id: z.string(),
  label: z.string(),
  organization: z.string().nullable(),
  address: z.string().nullable(),
  dispatch_mode: letterheadDispatchModeSchema,
  show_return_line: z.boolean(),
  show_fold_marks: z.boolean(),
  /** Dateiname des hochgeladenen Briefbogens, null wenn das CI-Layout gilt. */
  stationery_file: z.string().nullable(),
  is_default: z.boolean(),
  created_at: z.union([z.string(), z.date()]),
  updated_at: z.union([z.string(), z.date()]),
});
export type Letterhead = z.infer<typeof letterheadSchema>;

export const letterheadCreateBodySchema = z.object({
  label: letterheadLabelSchema,
  organization: letterheadOrganizationSchema.optional(),
  address: letterheadAddressSchema.optional(),
  dispatch_mode: letterheadDispatchModeSchema.optional(),
  show_return_line: z.boolean().optional(),
  show_fold_marks: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const letterheadUpdateBodySchema = letterheadCreateBodySchema.partial();

export const letterheadListResponseSchema = z.object({
  letterheads: z.array(letterheadSchema),
});

export const letterheadResponseSchema = z.object({
  letterhead: letterheadSchema,
});

export const letterheadErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
