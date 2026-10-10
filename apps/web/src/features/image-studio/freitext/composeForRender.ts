import {
  composeSharepic,
  type ComposedSharepic,
  ensureFontsReady,
  fingerprint,
  type SharepicTweakChoice,
} from '@gruenerator/canvas-editor/composer';
import {
  SHAREPIC_SCENE_REF,
  SHAREPIC_SOURCE_KEY,
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
  photoSrc: (filename: string) => string = creatorPhotoSrc,
  kiLabel = true
): Promise<ComposedSharepic> {
  await ensureFontsReady();
  // Photo brightness decides how dense the scrim gets; a failed measure is no tone.
  await primePhotoTones(spec, photoSrc);
  return composeSharepic(spec, {
    photoSrc,
    attributions,
    kiLabel,
    photoTone: (filename, side) => cachedPhotoTone(filename, side, spec.format),
  });
}

/** What a composed deck came from: the BASE spec (before tweaks), the tweak choice and the photo credits. */
export interface SharepicMintSource {
  base: SharepicSpec;
  tweaks: SharepicTweakChoice;
  attributions: (SharepicPhotoAttribution | null)[];
}

/**
 * The seed for a freeform canvas — one page per slide. The flat cover keys
 * beside `pages` serve the gallery card, as for slider decks.
 */
export function canvasSeed(
  composed: ComposedSharepic,
  source?: SharepicMintSource
): {
  templateType: ComposedSharepic['templateType'];
  format: SharepicFormat;
  pageCount: number;
  initialState: Record<string, unknown>;
} {
  // One deck id per mint groups the pages of a carousel for the spec path.
  if (source && source.base.slides.length !== composed.slides.length) {
    console.warn('canvasSeed: spec and composed slide counts differ, writing no sharepicSource.');
    source = undefined;
  }
  const deck = source ? crypto.randomUUID() : null;
  const pages = composed.slides.map((state, i) => ({
    id: `seed-${i}`,
    configId: composed.templateType,
    state:
      source && deck
        ? {
            ...state,
            [SHAREPIC_SOURCE_KEY]: {
              v: 1,
              deck,
              slide: { ...source.base, slides: [source.base.slides[i]!] },
              attribution: source.attributions[i] ?? null,
              ...(Object.keys(source.tweaks).length > 0 && { tweaks: source.tweaks }),
              // What the page shows: composed from the tweaked spec.
              baseline: fingerprint(state),
            },
          }
        : state,
  }));
  return {
    templateType: composed.templateType,
    format: composed.format,
    pageCount: pages.length,
    initialState: { ...composed.slides[0]!, pages },
  };
}
