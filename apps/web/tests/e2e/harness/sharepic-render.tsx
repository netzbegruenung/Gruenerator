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

window.__sharepicHarness = {
  fixtures: () => Object.keys(FIXTURES),

  renderFixture(name) {
    const spec = FIXTURES[name];
    return spec ? this.render({ spec }) : Promise.resolve({ error: `no fixture ${name}` });
  },

  async render({ spec }) {
    const parsed = sharepicSpecSchema.safeParse(spec);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'invalid spec' };
    try {
      const composed = await composeCreatorSharepic(
        parsed.data,
        parsed.data.slides.map(() => null),
        photoSrc
      );
      const images = await renderPreviews(composed);
      return images ? { images } : { error: 'render failed' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  renderLegacy(canvasType) {
    return renderSharepicToImage(canvasType, {}, { quality: 'preview' });
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
