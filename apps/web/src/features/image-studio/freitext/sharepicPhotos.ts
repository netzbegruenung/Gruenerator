import { SHAREPIC_UPLOAD_MAX, type SharepicPhotoAnalysis } from '@gruenerator/contracts';

/** The user's own photos in the creator. */
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
