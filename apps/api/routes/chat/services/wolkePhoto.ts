import { type WolkeFileRef } from '@gruenerator/contracts';

const WOLKE_PHOTO_EXT = /\.(?:jpe?g|png|webp)$/i;

/**
 * A Wolke file the sharepic creator takes as a photo — the extension decides.
 * One predicate for both readers: the classifier routes a sharepic order over
 * photos-only material to the single pass because `collectTurnPhotos` reads
 * exactly these files there.
 */
export const isWolkePhoto = (ref: Pick<WolkeFileRef, 'name'>): boolean =>
  WOLKE_PHOTO_EXT.test(ref.name);
