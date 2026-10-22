import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCanvas } from '@napi-rs/canvas';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { getCanvasFormat } from '../../formats';

import { buildPptxModel } from './buildPptxModel';
import { PRESENTATION_FIXTURE_DECKS } from './presentationFixtureDeck';
import { writePptx, type WritePptxDeps } from './writePptx';

/**
 * Schreibt das Prüf-Deck als .pptx (Pfad steht im Log) für die Handprüfung in
 * `FIDELITY.md`. Ziel: `PPTX_FIXTURE_DIR`, sonst ein Ordner im Temp-Verzeichnis.
 * Raster sind beschriftete Platzhalter — das Stage gibt es hier nicht.
 */

function placeholderPng(width: number, height: number, label: string, fill: string): string {
  const canvas = createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#E4007C';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.max(12, Math.min(28, canvas.height / 4))}px sans-serif`;
  ctx.fillText(label, 8, Math.min(canvas.height - 8, 32));
  return canvas.toDataURL('image/png');
}

const deps: WritePptxDeps = {
  rasterize: async (request) => ({
    dataUrl: placeholderPng(
      request.box.width,
      request.box.height,
      `${request.reason}: ${request.elementId}`,
      'rgba(255, 255, 255, 0.25)'
    ),
    box: request.box,
  }),
  loadImage: async (src) => ({
    dataUrl: placeholderPng(1600, 1000, src, '#9CC5E0'),
    width: 1600,
    height: 1000,
  }),
};

describe('presentation fixture deck', () => {
  const format = getCanvasFormat('slide-16-9')!;

  for (const [locale, pages] of Object.entries(PRESENTATION_FIXTURE_DECKS)) {
    it(`writes the ${locale} deck with every element kind`, async () => {
      const model = buildPptxModel(pages, format);
      for (const slide of model.slides) expect(slide.unknownKeys).toEqual([]);
      const kinds = new Set(model.slides.flatMap((s) => s.items.map((item) => item.kind)));
      expect([...kinds].sort()).toEqual(['chart', 'image', 'raster', 'shape', 'text']);

      const { blob, skipped } = await writePptx(model, { ...deps, title: `Prüf-Deck ${locale}` });
      expect(skipped).toEqual([]);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const files = unzipSync(bytes);
      expect(Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))).toHaveLength(
        pages.length
      );
      expect(strFromU8(files['ppt/notesSlides/notesSlide1.xml']!)).toContain('Begrüßung');

      const dir = process.env.PPTX_FIXTURE_DIR ?? join(tmpdir(), 'gruenerator-pptx-fixture');
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `praesentation-${locale}.pptx`);
      writeFileSync(path, bytes);
      console.warn(`[pptx fixture] ${path}`);
    });
  }
});
