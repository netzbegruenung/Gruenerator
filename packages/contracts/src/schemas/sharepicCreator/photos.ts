import { z } from 'zod';

import { sharepicTextSideSchema } from './enums.js';
import { oneLine } from './primitives.js';
import { SHAREPIC_UPLOAD_ID } from './refs.js';

export const sharepicPhotoFitSchema = z.enum(['vollflaeche', 'oben', 'unten']);
export type SharepicPhotoFit = z.infer<typeof sharepicPhotoFitSchema>;

/**
 * What the vision model sees in one of the user's own photos. It never names
 * or identifies a person — `personen` is a head count, nothing more.
 */
export const sharepicPhotoAnalysisModelSchema = z.object({
  /** Short description of the motif. */
  motiv: oneLine(240),
  personen: z.number().int().min(0).max(99),
  /** Where text has room: the calm side of the picture. */
  ruhigeSeite: sharepicTextSideSchema,
  hell: z.boolean(),
  /** `vollflaeche` = the whole sharepic; `oben`/`unten` = the photo fills only that half. */
  eignung: sharepicPhotoFitSchema,
  stichworte: z.array(oneLine(40)).max(8),
});

export const sharepicPhotoAnalysisSchema = sharepicPhotoAnalysisModelSchema.extend({
  /** false = the vision call failed; the other fields are neutral placeholders. */
  analysiert: z.boolean(),
});
export type SharepicPhotoAnalysis = z.infer<typeof sharepicPhotoAnalysisSchema>;

/** What a draft gets when vision is unavailable: a placeholder that claims nothing. */
export const SHAREPIC_NEUTRAL_PHOTO_ANALYSIS: SharepicPhotoAnalysis = {
  motiv: 'Eigenes Foto (nicht automatisch beschrieben)',
  personen: 0,
  ruhigeSeite: 'unten',
  hell: false,
  eignung: 'vollflaeche',
  stichworte: [],
  analysiert: false,
};

export const sharepicOwnPhotoSchema = z.object({
  id: z.string().regex(SHAREPIC_UPLOAD_ID),
  analysis: sharepicPhotoAnalysisSchema,
});
export type SharepicOwnPhoto = z.infer<typeof sharepicOwnPhotoSchema>;

/** The durable URL `uploadBlobToMediaLibrary` returns — the server reads the file itself, it never fetches. */
export const SHAREPIC_PHOTO_URL = /^\/api\/share\/([\w-]{16,64})\/download$/;
export const sharepicPhotoUrlSchema = z.string().regex(SHAREPIC_PHOTO_URL);

export const sharepicAnalyzePhotoBodySchema = z.object({ url: sharepicPhotoUrlSchema });
