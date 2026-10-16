/**
 * Dev-only harness: composes a print spec and renders its pages with the
 * editor's own renderer, cropped to the trimmed product (the 3 mm bleed
 * removed; the preview render draws no guides). Used by
 * `harness/render-print-vorlagen.ts`.
 *
 * Served by the Vite dev server at /tests/e2e/harness/print-render.html; NOT
 * part of the production build.
 */
import { getCanvasFormat, isPrintFormat, printGeometry } from '@gruenerator/canvas-editor';
import {
  composePrint,
  ensureFontsReady,
  PRINT_VORLAGEN,
} from '@gruenerator/canvas-editor/composer';
import { printSpecSchema } from '@gruenerator/contracts';

import { renderSharepicToImage } from '../../../src/features/image-studio/renderSharepicToImage';
import '../../../src/assets/styles/common/typography.css';

import './printHarness';

async function cropToTrim(dataUrl: string, formatId: string, width: number): Promise<string> {
  const format = getCanvasFormat(formatId);
  if (!format || !isPrintFormat(format)) throw new Error(`no print format ${formatId}`);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = img.naturalWidth / format.width;
  const { trim } = printGeometry(format);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((trim.height / trim.width) * width);
  canvas
    .getContext('2d')!
    .drawImage(
      img,
      trim.x * k,
      trim.y * k,
      trim.width * k,
      trim.height * k,
      0,
      0,
      canvas.width,
      canvas.height
    );
  return canvas.toDataURL('image/webp', 0.86);
}

window.__printHarness = {
  vorlagen: () => PRINT_VORLAGEN.map(({ id, spec }) => ({ id, spec })),

  async render(spec, width) {
    const parsed = printSpecSchema.safeParse(spec);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'invalid spec' };
    try {
      await ensureFontsReady();
      const composed = composePrint(parsed.data);
      const images: string[] = [];
      for (const slide of composed.slides) {
        const png = await renderSharepicToImage(composed.templateType, slide, {
          quality: 'preview',
          formatId: composed.format,
        });
        if (!png) return { error: 'render failed' };
        images.push(await cropToTrim(png, composed.format, width));
      }
      return { images };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};
