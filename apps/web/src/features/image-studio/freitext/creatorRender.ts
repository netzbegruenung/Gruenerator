import {
  applySharepicPatch,
  applySharepicTweaks,
  type ComposedSharepic,
  sharepicTweaks,
  type SharepicTweak,
  type SharepicTweakChoice,
} from '@gruenerator/canvas-editor/composer';
import {
  parseSharepicChatProps,
  type SharepicChatReview,
  type SharepicPatchOp,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { renderSharepicToImage } from '../renderSharepicToImage';
import { downloadSharepicZip } from '../services/downloadSharepicZip';

import { composeCreatorSharepic, sharepicPhotoSrc } from './composeForRender';
import { loadImage } from './photoTone';
import { reviseWithReview } from './sharepicRevisionLoop';

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

/** Every slide at export size: one PNG, or a carousel as a ZIP. */
export async function downloadDesign(c: ComposedSharepic): Promise<void> {
  const images = await Promise.all(
    c.slides.map((slide) => renderSharepicToImage(c.templateType, slide, { formatId: c.format }))
  );
  if (!images.every((image): image is string => !!image)) {
    throw new Error('Das Sharepic konnte nicht exportiert werden.');
  }
  if (images.length === 1)
    await downloadDataUrl(images[0]!, `gruenerator-sharepic-${Date.now()}.png`);
  else await downloadSharepicZip(images, c.templateType);
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
 * A chat sharepic as the model's review sees it: one image, a carousel as a
 * contact sheet. Null when it cannot be rendered.
 */
export async function renderSharepicSheet(
  initialProps: Record<string, unknown>
): Promise<string | null> {
  const props = parseSharepicChatProps(initialProps);
  if (!props) return null;
  const composed = await composeCreatorSharepic(
    props.creatorSpec,
    props.attributions,
    sharepicPhotoSrc(props.photos ?? [])
  );
  const previews = await renderPreviews(composed);
  return previews ? contactSheet(previews) : null;
}

/** The turn's message is saved just after `done`; a fast review can arrive before it. */
const SAVE_ATTEMPTS = 3;
const SAVE_RETRY_MS = 1500;

/**
 * The studio's review loop for a sharepic the chat just made: rendered, seen
 * by the vision review against what the turn ordered, patched for up to
 * MAX_REVIEWS rounds. A correction is saved onto the thread's variant and
 * returned as its new props; null when nothing changed or saving failed.
 */
export async function reviewChatSharepic(input: {
  threadId: string;
  variantId: string;
  initialProps: Record<string, unknown>;
  review: SharepicChatReview;
}): Promise<Record<string, unknown> | null> {
  const props = parseSharepicChatProps(input.initialProps);
  // A tweaked spec is composed from its base; the review patches neither.
  if (!props || props.creatorBase) return null;
  const photoSrc = sharepicPhotoSrc(props.photos ?? []);
  const client = getContractsClient();
  const revised = await reviseWithReview({
    spec: props.creatorSpec,
    attributions: props.attributions,
    brief: input.review.brief,
    deps: {
      compose: (spec, attributions) => composeCreatorSharepic(spec, attributions, photoSrc),
      render: renderPreviews,
      review: async ({ spec, brief, previews }) => {
        const image = await contactSheet(previews).catch(() => null);
        if (!image) return null;
        const res = await client.sharepicCreator
          .review({ body: { spec, prompt: brief, image, mode: input.review.mode } })
          .catch(() => null);
        return res?.status === 200 ? res.body : null;
      },
      applyPatch: (spec, patch) => applySharepicPatch(spec, patch).spec,
    },
  });
  if (!revised?.previews || revised.spec === props.creatorSpec) return null;

  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    const res = await client.threads
      .saveReviewedSharepic({
        params: { threadId: input.threadId, variantId: input.variantId },
        body: { creatorSpec: revised.spec },
      })
      .catch(() => null);
    if (res?.status === 200) return { ...input.initialProps, creatorSpec: revised.spec };
    if (res?.status !== 404 || attempt === SAVE_ATTEMPTS) return null;
    await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_MS));
  }
  return null;
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
  const sheet = input.sheet ? await contactSheet(images).catch(() => null) : null;
  return { base, spec, tweaks: sharepicTweaks(base, input.choice), images, sheet };
}
