import {
  SHAREPIC_NEUTRAL_PHOTO_ANALYSIS,
  SHAREPIC_UPLOAD_MAX,
  type SharepicPhotoAnalysis,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

import { uploadBlobToMediaLibrary } from '../services/mediaUploadService';

/** The user's own photos in the creator: what is accepted and how one is made ready. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = SHAREPIC_UPLOAD_MAX;

/** Used when a photo comes without words: "Mach was aus dem Foto". */
export const PHOTO_ONLY_PROMPT = 'Mach ein passendes Sharepic aus meinem Foto.';

/** A photo that is in the media library and has been looked at. */
export interface CreatorPhoto {
  name: string;
  /** Durable media-library URL, never a `blob:`. */
  url: string;
  analysis: SharepicPhotoAnalysis;
}

/** Why a file cannot be used, or null. */
export function photoFileProblem(file: File): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return `„${file.name}“ ist kein JPEG, PNG oder WebP.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `„${file.name}“ ist größer als 10 MB.`;
  }
  return null;
}

/**
 * Uploads the photo to the person's media library and has it described. A
 * failed upload throws (there is nothing to build on); a failed description
 * does not — the photo then goes in with a neutral one.
 */
export async function preparePhoto(file: File): Promise<CreatorPhoto> {
  const problem = photoFileProblem(file);
  if (problem) throw new Error(problem);
  const url = await uploadBlobToMediaLibrary(file, {
    filename: file.name,
    uploadSource: 'sharepic-creator',
  }).catch(() => null);
  if (!url) throw new Error(`„${file.name}“ konnte nicht hochgeladen werden.`);
  const response = await getContractsClient()
    .sharepicCreator.analyzePhoto({ body: { url } })
    .catch(() => null);
  const analysis =
    response?.status === 200 ? response.body : { ...SHAREPIC_NEUTRAL_PHOTO_ANALYSIS };
  return { name: file.name, url, analysis };
}
