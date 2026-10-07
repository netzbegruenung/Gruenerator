import {
  applySharepicPatch,
  applySharepicTweaks,
  type ComposedSharepic,
  sharepicTweaks,
  type SharepicTweak,
  type SharepicTweakChoice,
} from '@gruenerator/canvas-editor/composer';
import {
  type SharepicPatchOp,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { renderSharepicToImage } from '../renderSharepicToImage';

import { composeCreatorSharepic } from './composeForRender';
import { loadImage } from './photoTone';

export async function renderPreviews(c: ComposedSharepic): Promise<string[] | null> {
  const images = await Promise.all(
    c.slides.map((slide) =>
      renderSharepicToImage(c.templateType, slide, {
        quality: 'preview',
        formatId: c.format,
      })
    )
  );
  return images.every((image): image is string => !!image) ? images : null;
}

/**
 * The review sees a carousel at once: slides in swipe order on a grid, each
 * numbered as the patch addresses it.
 */
export async function contactSheet(previews: string[]): Promise<string | null> {
  if (previews.length === 1) return previews[0] ?? null;
  const images = await Promise.all(previews.map(loadImage));
  const columns = Math.min(images.length, 4);
  const rows = Math.ceil(images.length / columns);
  const width = 432;
  // The slide's own aspect, 4:5 or 3:4.
  const height = Math.round((width * images[0]!.naturalHeight) / images[0]!.naturalWidth);
  const gap = 12;
  const canvas = document.createElement('canvas');
  canvas.width = columns * width + (columns - 1) * gap;
  canvas.height = rows * height + (rows - 1) * gap;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, i) => {
    const x = (i % columns) * (width + gap);
    const y = Math.floor(i / columns) * (height + gap);
    ctx.drawImage(image, x, y, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, 44, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(String(i), x + 14, y + 29);
  });
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * One creator turn for a host that cannot render (the mobile app): the review
 * patch goes onto the draft, the design choices onto the result, and every
 * slide is rendered. Null when any slide failed. Stock photos only — the app
 * has no own uploads.
 */
export async function renderCreatorTurn(input: {
  base: SharepicSpec;
  patch: SharepicPatchOp[] | null;
  choice: SharepicTweakChoice;
  attributions: (SharepicPhotoAttribution | null)[];
  sheet: boolean;
}): Promise<{
  base: SharepicSpec;
  spec: SharepicSpec;
  tweaks: SharepicTweak[];
  images: string[];
  sheet: string | null;
} | null> {
  const base = input.patch ? applySharepicPatch(input.base, input.patch).spec : input.base;
  const spec = applySharepicTweaks(base, input.choice);
  const composed = await composeCreatorSharepic(spec, input.attributions);
  const images = await renderPreviews(composed);
  if (!images) return null;
  const sheet = input.sheet ? await contactSheet(images) : null;
  return { base, spec, tweaks: sharepicTweaks(base, input.choice), images, sheet };
}
