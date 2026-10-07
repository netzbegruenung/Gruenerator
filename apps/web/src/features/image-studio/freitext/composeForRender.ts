import {
  composeSharepic,
  type ComposedSharepic,
  ensureFontsReady,
} from '@gruenerator/canvas-editor/composer';
import {
  SHAREPIC_SCENE_REF,
  type SharepicFormat,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { cachedPhotoTone, primePhotoTones } from './photoTone';

const stockPhotoSrc = (filename: string): string =>
  `/api/image-picker/stock-image/${encodeURIComponent(filename)}`;

/** A stock file, or a scene FLUX painted into the user's media library (`ki:<token>`). */
export const creatorPhotoSrc = (filename: string): string => {
  const token = SHAREPIC_SCENE_REF.exec(filename)?.[1];
  return token ? `/api/share/${token}/download` : stockPhotoSrc(filename);
};

export async function composeCreatorSharepic(
  spec: SharepicSpec,
  attributions: (SharepicPhotoAttribution | null)[],
  photoSrc: (filename: string) => string = creatorPhotoSrc
): Promise<ComposedSharepic> {
  await ensureFontsReady();
  // Photo brightness decides how dense the scrim gets; a failed measure is no tone.
  await primePhotoTones(spec, photoSrc);
  return composeSharepic(spec, {
    photoSrc,
    attributions,
    photoTone: (filename, side) => cachedPhotoTone(filename, side, spec.format),
  });
}

/**
 * The seed for a freeform canvas — one page per slide. The flat cover keys
 * beside `pages` serve the gallery card, as for slider decks.
 */
export function canvasSeed(composed: ComposedSharepic): {
  templateType: ComposedSharepic['templateType'];
  format: SharepicFormat;
  pageCount: number;
  initialState: Record<string, unknown>;
} {
  const pages = composed.slides.map((state, i) => ({
    id: `seed-${i}`,
    configId: composed.templateType,
    state,
  }));
  return {
    templateType: composed.templateType,
    format: composed.format,
    pageCount: pages.length,
    initialState: { ...pages[0]!.state, pages },
  };
}
