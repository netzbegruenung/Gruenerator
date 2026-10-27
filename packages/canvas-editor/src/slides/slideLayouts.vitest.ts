/**
 * Die 16 CD-Folien: für beide Länder ein gültiger Zustand der freien Seite,
 * und im PPTX bleibt jeder Text, jede Form, jedes Diagramm und jedes Foto
 * nativ — gerastert werden nur Grafiken (Sonnenblume, Logo).
 */
import { getCanvasFormat } from '@ggraphic/editor/formats/index';
import { createCanvas } from '@napi-rs/canvas';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { createFreeformAtFullConfig } from '../configs/freeform_at_full.config';
import { createFreeformFullConfig, type FreeformState } from '../configs/freeform_full.config';
import { buildPptxModel } from '../export/pptx/buildPptxModel';
import { writePptx, type WritePptxDeps } from '../export/pptx/writePptx';
import { getAssetById } from '../utils/canvasAssets';

import {
  buildSlideLayout,
  DEFAULT_SLIDE_LAYOUT,
  SLIDE_LAYOUTS,
  slideLayoutConfigId,
  type SlideLayoutState,
} from './slideLayouts';

const format = getCanvasFormat('slide-16-9')!;
const DATE = new Date(2025, 9, 7);
const LOCALES = ['de-DE', 'de-AT'] as const;

function idsOf(state: SlideLayoutState): string[] {
  return [
    ...state.additionalTexts.map((t) => t.id),
    ...state.shapeInstances.map((s) => s.id),
    ...state.assetInstances.map((a) => a.id),
    ...state.chartInstances.map((c) => c.id),
  ];
}

describe('slide layout registry', () => {
  it('has the 16 CD slides, ten dark and six light, with unique ids', () => {
    expect(SLIDE_LAYOUTS).toHaveLength(16);
    expect(new Set(SLIDE_LAYOUTS.map((l) => l.id)).size).toBe(16);
    expect(SLIDE_LAYOUTS.filter((l) => l.theme === 'dunkel')).toHaveLength(10);
    expect(DEFAULT_SLIDE_LAYOUT).toBe('titel');
  });

  for (const locale of LOCALES) {
    const config =
      locale === 'de-AT' ? createFreeformAtFullConfig(format) : createFreeformFullConfig(format);

    it(`seeds the ${locale} freeform page with every element of every layout`, () => {
      expect(config.id).toBe(slideLayoutConfigId(locale));
      for (const { id } of SLIDE_LAYOUTS) {
        const state = buildSlideLayout(id, { locale, pageNumber: 3, date: DATE });
        const ids = idsOf(state);
        expect(new Set(ids).size, id).toBe(ids.length);
        expect([...state.layerOrder].sort(), id).toEqual([...ids].sort());
        for (const locked of state.lockedLayerIds) expect(ids).toContain(locked);
        for (const asset of state.assetInstances)
          expect(getAssetById(asset.assetId), id).toBeTruthy();
        expect(state.notes).toBe('');
        expect(state.additionalTexts.find((t) => t.id === 'folie-seitenzahl')?.text).toBe('3');

        const seeded = config.createInitialState(state) as FreeformState;
        expect(seeded.additionalTexts, id).toEqual(state.additionalTexts);
        expect(seeded.shapeInstances, id).toEqual(state.shapeInstances);
        expect(seeded.chartInstances, id).toEqual(state.chartInstances);
        expect(seeded.layerOrder, id).toEqual(state.layerOrder);
        expect(seeded.backgroundColor, id).toBe(state.backgroundColor);
        expect(seeded.backgroundMode, id).toBe(state.backgroundMode);
      }
    });

    it(`keeps every ${locale} text native in the PPTX model`, () => {
      const pages = SLIDE_LAYOUTS.map(({ id }, i) =>
        buildSlideLayout(id, { locale, pageNumber: i + 1, date: DATE })
      );
      const model = buildPptxModel(pages, format);
      model.slides.forEach((slide, i) => {
        const state = pages[i]!;
        const layout = SLIDE_LAYOUTS[i]!.id;
        expect(slide.unknownKeys, layout).toEqual([]);
        const rasters = slide.items.flatMap((item) => (item.kind === 'raster' ? [item] : []));
        // Nur Grafiken werden Bilder; Texte, Formen, Diagramme und Fotos bleiben nativ.
        for (const raster of rasters)
          expect(raster.reason, `${layout} ${raster.elementId}`).toBe('asset');
        const texts = slide.items.filter((item) => item.kind === 'text');
        expect(texts.map((t) => t.id).sort(), layout).toEqual(
          state.additionalTexts.map((t) => t.id).sort()
        );
        expect(slide.items.filter((item) => item.kind === 'chart')).toHaveLength(
          state.chartInstances.length
        );
        if (state.backgroundMode === 'image') {
          expect(
            slide.items.some((item) => item.kind === 'image'),
            layout
          ).toBe(true);
        }
      });
    });
  }

  it('writes the 16 slides into a PowerPoint file', async () => {
    const png = (w: number, h: number) => {
      const canvas = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      return canvas.toDataURL('image/png');
    };
    const deps: WritePptxDeps = {
      rasterize: async (request) => ({
        dataUrl: png(request.box.width, request.box.height),
        box: request.box,
      }),
      loadImage: async () => ({ dataUrl: png(160, 100), width: 1600, height: 1000 }),
    };
    const pages = SLIDE_LAYOUTS.map(({ id }, i) =>
      buildSlideLayout(id, { locale: 'de-DE', pageNumber: i + 1, date: DATE })
    );
    const { blob, skipped } = await writePptx(buildPptxModel(pages, format), {
      ...deps,
      title: 'Folienlayouts',
    });
    expect(skipped).toEqual([]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))).toHaveLength(
      16
    );
    expect(strFromU8(files['ppt/slides/slide1.xml']!)).toContain('Titelfolie');
  });

  it('writes the footer date in the deck locale', () => {
    const at = buildSlideLayout('titel', {
      locale: 'de-AT',
      pageNumber: 1,
      date: new Date(2026, 0, 5),
    });
    expect(at.additionalTexts.find((t) => t.id === 'folie-datum')?.text).toBe(
      'Montag, 5. Jänner 2026'
    );
    const de = buildSlideLayout('titel', { locale: 'de-DE', pageNumber: 1, date: DATE });
    expect(de.additionalTexts.find((t) => t.id === 'folie-datum')?.text).toBe(
      'Dienstag, 7. Oktober 2025'
    );
  });

  it('returns a fresh state on every call', () => {
    const a = buildSlideLayout('titel', { locale: 'de-DE', pageNumber: 1, date: DATE });
    const b = buildSlideLayout('titel', { locale: 'de-DE', pageNumber: 1, date: DATE });
    expect(a).toEqual(b);
    expect(a.additionalTexts).not.toBe(b.additionalTexts);
  });
});
