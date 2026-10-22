/**
 * Dev-only harness: composes a creator spec and renders its slides with the
 * editor's own renderer — the same path as the Sharepic-Creator's previews.
 *
 * Used by `sharepic-visual.spec.ts` (public fixture specs) and by
 * `harness/render-sharepic-vorlagen.ts` (the private Vorlagen catalogue's
 * thumbnails). Stock photos come straight from the repo via Vite's /@fs/, so
 * no backend is needed.
 *
 * Served by the Vite dev server at /tests/e2e/harness/sharepic-render.html; NOT
 * part of the production build.
 */
import {
  BLOCK_COLLECTIONS,
  COMPOSER_PLANE_IDS,
  liftBlock,
} from '@gruenerator/canvas-editor/composer';
import { sharepicSpecSchema } from '@gruenerator/contracts';

import {
  MORE_SPECS,
  SPECS,
} from '../../../../../packages/canvas-editor/src/composer/sharepicSpecFixtures';
import { composeCreatorSharepic } from '../../../src/features/image-studio/freitext/composeForRender';
import { renderPreviews } from '../../../src/features/image-studio/freitext/creatorRender';
import { renderSharepicToImage } from '../../../src/features/image-studio/renderSharepicToImage';

import './sharepicHarness';
// The brand faces (GrueneType, PT Sans, Gotham …), as the app declares them.
import '../../../src/assets/styles/common/typography.css';

// Vite serves the API's stock photos by their file URLs — a path under /api
// would hit the dev proxy instead.
const STOCK = import.meta.glob<string>('../../../../api/public/sharepic_example_bg/*.jpg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const photoSrc = (filename: string): string =>
  STOCK[`../../../../api/public/sharepic_example_bg/${filename}`] ?? filename;

const FIXTURE_PHOTO = 'diogo-ferrer-Ue8fAd5DXnY-unsplash.jpg';
const FIXTURES: Record<string, unknown> = Object.fromEntries(
  Object.entries({ ...SPECS, ...MORE_SPECS })
    .map(([name, spec]) => [name, JSON.stringify(spec)] as const)
    .filter(([, json]) => !json.includes('"ki:') && !json.includes('"upload:'))
    .map(
      ([name, json]) =>
        [name, JSON.parse(json.replace(/"[\w.-]+\.jpe?g"/g, `"${FIXTURE_PHOTO}"`))] as const
    )
    // Some fixtures probe the composer past the schema's limits; only what a Vorlage could be.
    .filter(([, spec]) => sharepicSpecSchema.safeParse(spec).success)
);

/** The composer's planes stay as the block's ground; the Kopfband is one too. */
const isPlane = (id: string) => [...COMPOSER_PLANE_IDS, 'sc-kopfband'].includes(id);

const loadImage = async (src: string) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

/** `withBlock` cut to where it differs from `ground`, plus a margin, at most 900 px wide. */
async function cropToDifference(ground: string, withBlock: string): Promise<string> {
  const [a, b] = await Promise.all([loadImage(ground), loadImage(withBlock)]);
  const { naturalWidth: w, naturalHeight: h } = b;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(a, 0, 0);
  const g = ctx.getImageData(0, 0, w, h).data;
  ctx.drawImage(b, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const diff =
        Math.abs(g[o]! - d[o]!) + Math.abs(g[o + 1]! - d[o + 1]!) + Math.abs(g[o + 2]! - d[o + 2]!);
      if (diff > 45) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < x0) throw new Error('block renders nothing');
  const pad = Math.round(w * 0.035);
  [x0, y0, x1, y1] = [
    Math.max(0, x0 - pad),
    Math.max(0, y0 - pad),
    Math.min(w, x1 + pad),
    Math.min(h, y1 + pad),
  ];
  const scale = Math.min(1, 900 / (x1 - x0));
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0) * scale);
  out.height = Math.round((y1 - y0) * scale);
  out.getContext('2d')!.drawImage(b, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
  return out.toDataURL('image/webp', 0.88);
}

window.__sharepicHarness = {
  fixtures: () => Object.keys(FIXTURES),

  renderFixture(name) {
    const spec = FIXTURES[name];
    return spec ? this.render({ spec }) : Promise.resolve({ error: `no fixture ${name}` });
  },

  async render({ spec, photos }) {
    const parsed = sharepicSpecSchema.safeParse(spec);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'invalid spec' };
    try {
      const composed = await composeCreatorSharepic(
        parsed.data,
        parsed.data.slides.map(() => null),
        (filename) => photos?.[filename] ?? photoSrc(filename)
      );
      const images = await renderPreviews(composed);
      return images ? { images } : { error: 'render failed' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  async renderBlock({ spec, photos }) {
    const parsed = sharepicSpecSchema.safeParse(spec);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'invalid spec' };
    try {
      const composed = await composeCreatorSharepic(
        parsed.data,
        [null],
        (filename) => photos?.[filename] ?? photoSrc(filename),
        false
      );
      const slide = composed.slides[0]!;
      const block = liftBlock(
        slide,
        parsed.data.slides[0]!.items.map((_, i) => i),
        'vorschau'
      );
      // The ground alone and the ground with the block: the block is where they differ.
      const ground = {
        ...slide,
        ...Object.fromEntries(
          BLOCK_COLLECTIONS.map((key) => [key, slide[key].filter((e) => isPlane(e.id))])
        ),
        selectedIcons: [],
        iconStates: {},
        layerOrder: slide.layerOrder.filter(isPlane),
      };
      const withBlock = {
        ...ground,
        ...Object.fromEntries(
          BLOCK_COLLECTIONS.map((key) => [key, [...ground[key], ...block[key]]])
        ),
        selectedIcons: block.selectedIcons,
        iconStates: block.iconStates,
        layerOrder: [...ground.layerOrder, ...block.layerOrder],
      };
      const [groundSrc, blockSrc] = await Promise.all(
        [ground, withBlock].map((s) =>
          renderSharepicToImage(composed.templateType, s, { formatId: composed.format })
        )
      );
      if (!groundSrc || !blockSrc) return { error: 'render failed' };
      return { image: await cropToDifference(groundSrc, blockSrc) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  async toWebp(dataUrl, width) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * width);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.86);
  },
};
