/**
 * An infographic's illustrations: FLUX.2 [klein] on Melious paints each point's
 * motive as a flat spot illustration on white, one call per motive, in
 * parallel. The white is cut away from the edges inward (white inside the
 * motive stays), the result is padded to a square and stored in the user's
 * media library; the spec carries it as `ki:<shareToken>`. Text never comes
 * from the model — the composer sets titles and numbers as editable layers.
 */
import fs from 'node:fs/promises';

import { type SharepicCreatorLocale } from '@gruenerator/contracts';
import { IMAGE_MODEL_BY_ID } from '@gruenerator/shared/models';
import sharp from 'sharp';

import { createLogger } from '../../utils/logger.js';
import { FluxImageService } from '../flux/index.js';
import { getSharedMediaService } from '../sharedMediaService.js';
import { getTreeBudget, treeBudgetSpentMessage, treeCostForImage } from '../trees/index.js';

const log = createLogger('sharepicCreator:illustrations');

/** FLUX.2 [klein]: a spot illustration needs no more, and it costs half an image. */
const UNIT_COST = treeCostForImage(IMAGE_MODEL_BY_ID['flux-klein'].costMultiplier);
/** Melious takes only fixed sizes; the motive fills about half of it. */
const PAINT_SIZE = 1024;
/** Longer side of the stored, trimmed illustration. */
const STORED_SIZE = 640;

const PALETTE: Record<SharepicCreatorLocale, string> = {
  'de-DE':
    'dark fir green, clover green, light grass green, sunflower yellow and a little warm sand',
  'de-AT': 'dark green, fresh light green, bright yellow and a little warm beige',
};

export function illustrationPrompt(motiv: string, locale: SharepicCreatorLocale): string {
  return (
    `${motiv.trim().replace(/\.$/, '')}. One single small flat vector spot illustration, centred, ` +
    'filling about half of the frame, compact and about as tall as it is wide, seen from the side and standing upright, ' +
    'on a completely plain, flat, pure white background with nothing else. ' +
    'The object has no white, grey or black areas: every surface is one of the palette colours, ' +
    'even where the real thing would be metal, black or white. ' +
    'Clean editorial infographic style: simple geometric shapes, solid flat fills, no gradients, ' +
    `no shadows, no texture, no outlines, no ground line. Colour palette: ${PALETTE[locale]}. ` +
    'Absolutely no text, letters, numbers, labels, logos or symbols.'
  );
}

/** Distance of a pixel from white, 0–255 (the largest channel gap). */
const fromWhite = (r: number, g: number, b: number) => 255 - Math.min(r, g, b);

/** Enclosed background at least this share of the image is a hole, not a highlight. */
const HOLE_SHARE = 0.0015;
/**
 * An enclosed light area is the background showing through only if nearly all
 * of it is the background's exact colour — a shaded white surface of the
 * motive (a switch plate, a dial) is not, and stays whole.
 */
const HOLE_MATCH = 3;
const HOLE_PURITY = 0.97;
/**
 * Largest share of the stored square the motive's own pixels may cover: a
 * compact motive (a sack, a frame) gets more air than a wide or airy one (a
 * building, a rack), so side by side they look about equally heavy.
 */
const MASS_SHARE = 0.3;

/**
 * Makes the white background transparent: a flood fill from the border, plus
 * enclosed islands of that same white large enough to be gaps (between a
 * drying rack's bars, inside a ring) — the prompt asks for no white in the
 * motive, small white highlights stay. Boundary pixels fade with their
 * distance from white, which keeps the anti-aliased edge without a halo.
 */
export async function cutOutFlat(png: Buffer, tolerance = 24): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const background = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const i = at(x, y);
    if (
      !background[y * width + x] &&
      fromWhite(data[i]!, data[i + 1]!, data[i + 2]!) <= tolerance
    ) {
      background[y * width + x] = 1;
      stack.push(x, y);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }
  // The background's own colour, from what the flood fill reached.
  const bg = [0, 0, 0];
  let bgCount = 0;
  for (let p = 0; p < width * height; p++) {
    if (!background[p]) continue;
    bg[0]! += data[p * 4]!;
    bg[1]! += data[p * 4 + 1]!;
    bg[2]! += data[p * 4 + 2]!;
    bgCount++;
  }
  const bgColour = bg.map((c) => c / Math.max(1, bgCount));
  const isBackgroundColour = (j: number) =>
    Math.abs(data[j]! - bgColour[0]!) <= HOLE_MATCH &&
    Math.abs(data[j + 1]! - bgColour[1]!) <= HOLE_MATCH &&
    Math.abs(data[j + 2]! - bgColour[2]!) <= HOLE_MATCH;
  // Enclosed light islands: whole components, cleared or kept as one.
  const seen = new Uint8Array(width * height);
  const minHole = Math.round(width * height * HOLE_SHARE);
  for (let start = 0; start < width * height; start++) {
    if (background[start] || seen[start]) continue;
    const i0 = start * 4;
    if (fromWhite(data[i0]!, data[i0 + 1]!, data[i0 + 2]!) > tolerance) continue;
    const component: number[] = [start];
    seen[start] = 1;
    for (let k = 0; k < component.length; k++) {
      const p = component[k]!;
      const x = p % width;
      const y = (p - x) / width;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ]) {
        if (q < 0 || seen[q] || background[q]) continue;
        const j = q * 4;
        if (fromWhite(data[j]!, data[j + 1]!, data[j + 2]!) > tolerance) continue;
        seen[q] = 1;
        component.push(q);
      }
    }
    if (component.length < minHole) continue;
    const pure = component.filter((p) => isBackgroundColour(p * 4)).length;
    if (pure >= component.length * HOLE_PURITY) for (const p of component) background[p] = 1;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y);
      if (background[y * width + x]) {
        data[i + 3] = 0;
        continue;
      }
      const touches =
        (x > 0 && background[y * width + x - 1]) ||
        (x < width - 1 && background[y * width + x + 1]) ||
        (y > 0 && background[(y - 1) * width + x]) ||
        (y < height - 1 && background[(y + 1) * width + x]);
      if (touches) {
        const d = fromWhite(data[i]!, data[i + 1]!, data[i + 2]!);
        data[i + 3] = Math.min(255, Math.round((255 * d) / (tolerance * 3)));
      }
    }
  }
  let opaque = 0;
  for (let p = 3; p < data.length; p += 4) if (data[p]! >= 128) opaque++;
  const cut = await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  // Trim to the motive, then stand it at the foot of a transparent square
  // (on a ground line, side by side in a row) with air to the sides and above.
  const trimmed = await sharp(cut).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const side = Math.round(
    Math.max(
      Math.max(trimmed.info.width, trimmed.info.height) * 1.04,
      Math.sqrt(opaque / MASS_SHARE)
    )
  );
  const squared = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: trimmed.data,
        left: Math.round((side - trimmed.info.width) / 2),
        top: side - trimmed.info.height,
      },
    ])
    .png()
    .toBuffer();
  // A pipeline of its own: sharp resizes before it composites.
  return sharp(squared).resize(STORED_SIZE, STORED_SIZE, { fit: 'inside' }).png().toBuffer();
}

export interface IllustrationResult {
  /** `ki:<shareToken>` per motive, `null` where painting failed. */
  refs: (string | null)[];
  hinweis: string | null;
}
export type IllustrationPainter = (
  motive: readonly string[],
  locale: SharepicCreatorLocale
) => Promise<IllustrationResult>;

export function createIllustrationPainter(userId: string): IllustrationPainter {
  return async (motive, locale) => {
    if (!motive.length) return { refs: [], hinweis: null };
    const budget = getTreeBudget();
    const total = UNIT_COST * motive.length;
    const reservation = await budget.reserve(userId, total);
    if (!reservation.ok) {
      return {
        refs: motive.map(() => null),
        hinweis:
          reservation.reason === 'unavailable'
            ? 'Die Illustrationen ließen sich nicht malen – an ihrer Stelle stehen Icons.'
            : `${treeBudgetSpentMessage(reservation.status, total)} An Stelle der Illustrationen stehen deshalb Icons.`.slice(
                0,
                300
              ),
      };
    }
    const media = getSharedMediaService();
    const refs = await Promise.all(
      motive.map(async (motiv) => {
        try {
          const flux = await FluxImageService.create('melious');
          const { stored } = await flux.generateFromPrompt(illustrationPrompt(motiv, locale), {
            width: PAINT_SIZE,
            height: PAINT_SIZE,
            // JPEG ringing around the motive would survive the cut as a halo.
            output_format: 'png',
          });
          const cut = await cutOutFlat(await fs.readFile(stored.filePath));
          const share = await media.uploadMediaFile(userId, {
            fileBuffer: cut,
            originalFilename: 'infografik-illustration.png',
            mimeType: 'image/png',
            title: 'Infografik-Illustration (KI)',
            altText: motiv.slice(0, 300),
            uploadSource: 'ai_generated',
          });
          return `ki:${share.shareToken}`;
        } catch (error) {
          log.warn(
            `illustration failed: ${error instanceof Error ? error.message : String(error)}`
          );
          return null;
        }
      })
    );
    const failed = refs.filter((r) => r === null).length;
    if (failed) await budget.release(userId, UNIT_COST * failed, reservation.status.day);
    return {
      refs,
      hinweis: failed
        ? `${failed === refs.length ? 'Die Illustrationen' : 'Einige Illustrationen'} ließen sich nicht malen – an ihrer Stelle stehen Icons.`
        : null,
    };
  };
}
