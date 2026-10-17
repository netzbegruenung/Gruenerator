/**
 * Dev-only harness: renders the first page of a canvas Vorlage (finished
 * editor pages, see `canvasVorlageFileEntrySchema`) with the editor's own
 * renderer. Used by `harness/render-canvas-vorlagen.ts`.
 *
 * Served by the Vite dev server at /tests/e2e/harness/canvas-render.html; NOT
 * part of the production build.
 */
import { ensureFontsReady, templateFitsFormat } from '@gruenerator/canvas-editor';
import { canvasVorlageFileEntrySchema } from '@gruenerator/contracts';

import { renderSharepicToImage } from '../../../src/features/image-studio/renderSharepicToImage';
import '../../../src/assets/styles/common/typography.css';

import './canvasHarness';

import type { CanvasConfigId } from '@gruenerator/canvas-editor';

async function toWebp(dataUrl: string, width: number): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * width);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.86);
}

window.__canvasHarness = {
  async render(entry, width) {
    const parsed = canvasVorlageFileEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { error: `${issue?.path.join('.')} ${issue?.message ?? 'invalid'}` };
    }
    const { format, pages } = parsed.data;
    const misfit = pages.find((p) => !templateFitsFormat(p.configId as CanvasConfigId, format));
    if (misfit) return { error: `template ${misfit.configId} does not fit ${format}` };
    try {
      await ensureFontsReady();
      const png = await renderSharepicToImage(pages[0]!.configId, pages[0]!.state, {
        quality: 'full',
        formatId: format,
      });
      return png ? { image: await toWebp(png, width) } : { error: 'render failed' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};
