import { type CreatorPhoto } from './sharepicPhotos';

/**
 * What the Bild-Editor's „Sharepic" mode hands the chat page in router state:
 * the first request and the photos attached next to it. The photos are already
 * in the media library and described, so they travel as durable URLs.
 */
export interface FreitextHandoff {
  prompt: string;
  photos: CreatorPhoto[];
}

const isPhoto = (value: unknown): value is CreatorPhoto =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CreatorPhoto).url === 'string' &&
  typeof (value as CreatorPhoto).name === 'string' &&
  typeof (value as CreatorPhoto).analysis === 'object';

/** The hand-over carried by a navigation, or null when it carries none a draft could start from. */
export function readHandoff(state: unknown): FreitextHandoff | null {
  if (typeof state !== 'object' || state === null) return null;
  const { prompt, photos } = state as { prompt?: unknown; photos?: unknown };
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  const own = Array.isArray(photos) ? photos.filter(isPhoto) : [];
  // A photo alone is a request too.
  return text.length >= 3 || own.length ? { prompt: text, photos: own } : null;
}
