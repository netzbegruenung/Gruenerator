import { isSharepicUploadId, type SharepicSpec } from '@gruenerator/contracts';

import { type StructuredValidation } from '../ai/structuredParsing.js';

/** The one line the prompt adds when the draft carries the person's own photo. */
export const OWN_PHOTO_RULE =
  'Eigene Fotos der Person (upload:N) bleiben als Hintergrund, außer der Wunsch verlangt ausdrücklich ein anderes Foto oder keins.';

export const OWN_PHOTO_KEPT_HINWEIS =
  'Dein eigenes Foto bleibt – die Farbe ließ sich ohne Foto-Verlust nicht umsetzen.';

/** The request is about the photo itself: replacing or removing it is then wanted. */
const NAMES_PHOTO = /\b(foto|fotos|bild|bilds|hintergrundbild|aufnahme)\b/i;

export const namesPhoto = (instruction: string): boolean => NAMES_PHOTO.test(instruction);

const uploadOf = (slide: SharepicSpec['slides'][number]): string | null =>
  slide.background.kind !== 'farbe' && isSharepicUploadId(slide.background.filename)
    ? slide.background.filename
    : null;

export const hasOwnPhoto = (spec: SharepicSpec): boolean => spec.slides.some((s) => !!uploadOf(s));

export type OwnPhotoCheck =
  | { ok: true }
  /** `slides`: 0-based indices in `current` whose photo is gone; `restored`: the draft with them back. */
  | { ok: false; error: string; slides: number[]; restored: SharepicSpec };

/**
 * Whether a revision kept every own photo (`upload:N`) of `current` as a
 * background. Same slide count: slide by slide (the layout may change, the
 * file may not); otherwise each photo only has to be somewhere in the draft.
 */
export function ownPhotoKept(
  current: SharepicSpec,
  draft: SharepicSpec,
  instruction: string
): OwnPhotoCheck {
  if (namesPhoto(instruction)) return { ok: true };
  const sameCount = current.slides.length === draft.slides.length;
  const used = new Set(draft.slides.map(uploadOf));
  const lost = current.slides.flatMap((slide, i) => {
    const upload = uploadOf(slide);
    if (!upload) return [];
    const kept = sameCount ? uploadOf(draft.slides[i]!) === upload : used.has(upload);
    return kept ? [] : [i];
  });
  if (!lost.length) return { ok: true };
  const named = lost.map((i) => `Folie ${i + 1} (${uploadOf(current.slides[i]!)})`).join(', ');
  return {
    ok: false,
    slides: lost,
    error: `${named}: das ist das eigene Foto der Person – es bleibt. Für eine andere Farbe nimm \`foto-oben\` oder \`foto-unten\` mit demselben filename und \`panelColor\`, oder lass das Foto, wie es ist.`,
    restored: {
      ...draft,
      slides: draft.slides.map((slide, i) =>
        lost.includes(i) ? { ...slide, background: current.slides[i]!.background } : slide
      ),
    },
  };
}

/**
 * Wraps the check for the draft call's `validate`: rejects a lost own photo
 * (the repair turn follows), and after the last attempt `fallback` hands back
 * the draft with the photo restored and a note — but only if that rejection
 * was the final error.
 */
export function ownPhotoGuard<T extends { spec: SharepicSpec; scene: { slide: number } | null }>(
  current: SharepicSpec | null,
  instruction: string
) {
  let last: { error: string; value: T } | null = null;
  return {
    check(value: T): StructuredValidation<T> {
      if (!current) return { ok: true, value };
      const kept = ownPhotoKept(current, value.spec, instruction);
      if (kept.ok) return { ok: true, value };
      const scene = value.scene && kept.slides.includes(value.scene.slide) ? null : value.scene;
      last = { error: kept.error, value: { ...value, spec: kept.restored, scene } };
      return { ok: false, error: kept.error };
    },
    fallback(error: string): (T & { hinweis: string }) | null {
      return last && last.error === error
        ? { ...last.value, hinweis: OWN_PHOTO_KEPT_HINWEIS }
        : null;
    },
  };
}
