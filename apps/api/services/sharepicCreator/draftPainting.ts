import { isSharepicUploadId, type SharepicSpec } from '@gruenerator/contracts';

import { type CutOutPainter } from './cutOut.js';
import { type IllustrationPainter } from './illustrations.js';
import { type ScenePainter } from './sceneBackground.js';

/**
 * Paints every infographic point that names a motive and has no picture yet.
 * Without a painter, or where painting fails, the point keeps its icon.
 */
export async function paintIllustrations(
  spec: SharepicSpec,
  painter: IllustrationPainter | undefined
): Promise<{ spec: SharepicSpec; hinweis: string | null }> {
  // Quantities compare one thing at different sizes: one painting serves
  // every point, so they cannot differ in anything but size.
  const wanted = spec.slides.flatMap((slide) =>
    slide.items.flatMap((item) => {
      // Pictogram rows are icons; nothing to paint.
      if (item.type !== 'infografik' || item.form === 'anteil') return [];
      const open = item.punkte.filter((p) => !p.bild);
      if (item.form === 'mengen') {
        const motiv = open.find((p) => p.motiv)?.motiv;
        return motiv ? [{ motiv, punkte: open }] : [];
      }
      return open.flatMap((p) => (p.motiv ? [{ motiv: p.motiv, punkte: [p] }] : []));
    })
  );
  if (!wanted.length || !painter) return { spec, hinweis: null };
  const { refs, hinweis } = await painter(
    wanted.map((w) => w.motiv),
    spec.locale
  );
  const painted = new Map(
    wanted.flatMap((w, k) => w.punkte.map((p) => [p, refs[k] ?? null] as const))
  );
  return {
    hinweis,
    spec: {
      ...spec,
      slides: spec.slides.map((slide) => ({
        ...slide,
        items: slide.items.map((item) =>
          item.type !== 'infografik'
            ? item
            : {
                ...item,
                punkte: item.punkte.map((p) => {
                  const ref = painted.get(p);
                  return ref ? { ...p, bild: ref } : p;
                }),
              }
        ),
      })),
    },
  };
}

const CUT_OUT_FAILED_HINWEIS =
  'Das Foto ließ sich nicht freistellen – es steht ungeschnitten auf der Slide.';

/**
 * Sets the cut-out on every `freigestellt` bild; a Vorlage's own photo keeps
 * the cut-out it shipped with. A cut-out left on another ausschnitt is dropped. Without a painter (no user) a draft keeps the ones
 * it has; where cutting fails the photo stays uncut and the reply says so.
 */
export async function cutOutBilder(
  spec: SharepicSpec,
  painter: CutOutPainter | undefined,
  /** quelle → the cut-out a Vorlage shipped with it. */
  shipped: ReadonlyMap<string, string> = new Map()
): Promise<{ spec: SharepicSpec; hinweis: string | null }> {
  let failed = false;
  const pending = new Map<string, ReturnType<CutOutPainter>>();
  const cutOut = (quelle: string): ReturnType<CutOutPainter> => {
    let job = pending.get(quelle);
    if (!job) {
      job = painter ? painter(quelle) : Promise.resolve(null);
      pending.set(quelle, job);
    }
    return job;
  };
  const slides = await Promise.all(
    spec.slides.map(async (slide) => ({
      ...slide,
      items: await Promise.all(
        slide.items.map(async (item) => {
          if (item.type !== 'bild') return item;
          const { freisteller: _stale, ...rest } = item;
          if (item.ausschnitt !== 'freigestellt') return rest;
          const kept = shipped.get(item.quelle);
          if (kept) return { ...rest, freisteller: kept };
          // An own photo is never cut out: on a steckbrief it keeps its background.
          if (isSharepicUploadId(item.quelle)) return rest;
          if (!painter) return item;
          const ref = await cutOut(item.quelle);
          if (!ref) failed = true;
          return ref ? { ...rest, freisteller: ref } : rest;
        })
      ),
    }))
  );
  return { spec: { ...spec, slides }, hinweis: failed ? CUT_OUT_FAILED_HINWEIS : null };
}

export interface SharepicPainters {
  /** Paints a Faktenbild's `szene` background (FLUX 3). */
  scene?: ScenePainter;
  /** Paints an infographic's illustrations (FLUX.2 [klein]). */
  illustrations?: IllustrationPainter;
  /** Cuts out a `freigestellt` bild's photo (rembg). */
  cutOut?: CutOutPainter;
}
