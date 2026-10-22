import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import { writePptx, type WritePptxDeps } from './writePptx';

import type { PptxDeckModel, PptxRasterRequest, PptxTextItem } from './types';

/** 1 × 1 px, transparent. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const headline: PptxTextItem = {
  kind: 'text',
  id: 'text-head',
  box: box(100, 100, 1200, 240),
  rotation: 0,
  opacity: 1,
  paragraphs: [
    {
      runs: [
        {
          text: 'Wir ',
          bold: false,
          italic: false,
          underline: false,
          color: '#FFFFFF',
          highlight: null,
          fontFace: null,
        },
        {
          text: 'packen',
          bold: true,
          italic: false,
          underline: false,
          color: '#FFFFFF',
          highlight: null,
          fontFace: null,
        },
        {
          text: ' das ',
          bold: false,
          italic: false,
          underline: false,
          color: '#FFFFFF',
          highlight: null,
          fontFace: null,
        },
        {
          text: 'jetzt',
          bold: false,
          italic: true,
          underline: true,
          color: '#005538',
          highlight: '#FFF17A',
          fontFace: 'PT Sans',
        },
      ],
      bullet: null,
    },
    {
      runs: [
        {
          text: 'Zeile eins',
          bold: false,
          italic: false,
          underline: false,
          color: '#FFFFFF',
          highlight: null,
          fontFace: null,
        },
        {
          text: '\n\n',
          bold: false,
          italic: false,
          underline: false,
          color: '#FFFFFF',
          highlight: null,
          fontFace: null,
        },
        {
          text: 'Zeile zwei',
          bold: false,
          italic: false,
          underline: false,
          color: '#FFFFFF',
          highlight: null,
          fontFace: null,
        },
      ],
      bullet: null,
    },
  ],
  fontFace: 'GrueneTypeNeue',
  fontSize: 96,
  color: '#FFFFFF',
  bold: false,
  italic: false,
  align: 'center',
  valign: 'top',
  lineHeight: 1.2,
  outline: null,
  shadow: null,
};

const list: PptxTextItem = {
  ...headline,
  id: 'text-list',
  box: box(100, 500, 800, 300),
  align: 'left',
  fontSize: 40,
  fontFace: 'PT Sans',
  paragraphs: [
    {
      runs: [{ ...headline.paragraphs[0]!.runs[0]!, text: 'Saubere Luft' }],
      bullet: { type: 'bullet' },
    },
    {
      runs: [{ ...headline.paragraphs[0]!.runs[0]!, text: 'Jobs vor Ort' }],
      bullet: { type: 'bullet' },
    },
    {
      runs: [{ ...headline.paragraphs[0]!.runs[0]!, text: 'Drittens' }],
      bullet: { type: 'number', startAt: 3 },
    },
  ],
};

const icon: PptxRasterRequest = {
  kind: 'raster',
  elementId: 'pi-leaf',
  box: box(1170, 870, 60, 60),
  rotation: 0,
  reason: 'icon',
  boxExact: true,
};

const model: PptxDeckModel = {
  page: { width: 1920, height: 1080 },
  slides: [
    {
      background: { color: '#005538' },
      items: [
        {
          kind: 'image',
          id: 'background-image',
          box: box(0, 0, 1920, 1080),
          rotation: 0,
          opacity: 1,
          src: '/foto.jpg',
          fit: 'cover',
          rounding: false,
        },
        {
          kind: 'shape',
          id: 'shape-rect',
          box: box(500, 400, 200, 100),
          rotation: 15,
          opacity: 0.5,
          shape: 'roundRect',
          fill: '#8ABD24',
          rectRadius: 20,
          shadow: null,
        },
        headline,
        icon,
        list,
        {
          kind: 'chart',
          id: 'chart-1',
          box: box(1000, 300, 600, 400),
          rotation: 0,
          opacity: 1,
          chartType: 'bar',
          barDir: 'col',
          labels: ['Wind', 'Sonne'],
          values: [40, 25],
          colors: ['#005538', '#8ABD24'],
          title: 'Strommix',
          unit: '%',
          showLegend: true,
          showGrid: false,
          showValues: true,
          textColor: '#40403f',
        },
      ],
      notes: 'Begrüßung, dann zu den drei Gründen.',
      unknownKeys: [],
    },
    {
      background: { color: null },
      items: [
        { ...icon, elementId: 'stale-id' },
        {
          kind: 'image',
          id: 'user-image-1',
          box: box(100, 100, 400, 300),
          rotation: 0,
          opacity: 1,
          src: '/kaputt.jpg',
          fit: 'stretch',
          rounding: false,
        },
      ],
      notes: null,
      unknownKeys: [],
    },
  ],
};

function deps(overrides: Partial<WritePptxDeps> = {}): WritePptxDeps {
  return {
    rasterize: async (request) =>
      request.elementId === 'stale-id' ? null : { dataUrl: PNG, box: request.box },
    loadImage: async (src) =>
      src === '/kaputt.jpg' ? null : { dataUrl: PNG, width: 400, height: 200 },
    ...overrides,
  };
}

async function unzip(blob: Blob) {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  return (path: string) => {
    const file = files[path];
    return file ? strFromU8(file) : null;
  };
}

const texts = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
/** Objektnamen in Zeichenreihenfolge; der leere ist die Gruppe des Folienbaums. */
const names = (xml: string) =>
  [...xml.matchAll(/<p:cNvPr id="\d+" name="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
const count = (xml: string, tag: string) => xml.split(tag).length - 1;

describe('writePptx', () => {
  it('writes one wide slide per page with notes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { blob, skipped } = await writePptx(model, deps());
    warn.mockRestore();
    const read = await unzip(blob);

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(read('ppt/slides/slide1.xml')).not.toBeNull();
    expect(read('ppt/slides/slide2.xml')).not.toBeNull();
    expect(read('ppt/slides/slide3.xml')).toBeNull();
    // LAYOUT_WIDE: 13,333 × 7,5 in
    expect(read('ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"');
    expect(read('ppt/notesSlides/notesSlide1.xml')).toContain(
      'Begrüßung, dann zu den drei Gründen.'
    );
    expect(skipped).toEqual(['2:stale-id']);
  });

  it('writes texts as editable runs with their properties', async () => {
    const read = await unzip((await writePptx(model, deps())).blob);
    const slide = read('ppt/slides/slide1.xml')!;

    expect(texts(slide)).toEqual([
      'Wir ',
      'packen',
      ' das ',
      'jetzt',
      'Zeile eins',
      'Zeile zwei',
      'Saubere Luft',
      'Jobs vor Ort',
      'Drittens',
    ]);
    // 96 px auf 1920 px Breite = 48 pt
    expect(slide).toMatch(
      /<a:rPr lang="en-US" sz="4800" b="1"[^>]*>.*?<a:latin typeface="GrueneType Neue"/
    );
    expect(slide).toMatch(
      /sz="4800" i="1" u="sng"[^>]*><a:solidFill><a:srgbClr val="005538"\/><\/a:solidFill><a:highlight><a:srgbClr val="FFF17A"\/><\/a:highlight><a:latin typeface="PT Sans"/
    );
    // fester Zeilenabstand 48 pt × 1,2; der hardBreak bleibt im Absatz
    expect(slide).toContain('<a:lnSpc><a:spcPts val="5760"/></a:lnSpc>');
    // zwei Umbrüche: die Leerzeile bleibt
    expect(slide).toContain('<a:t>Zeile eins</a:t></a:r><a:br/><a:br/><a:r>');
    expect(count(slide, '<a:buChar')).toBe(2);
    // ein `<a:pPr>` je Absatz, auch bei mehreren Läufen
    for (const paragraph of slide.match(/<a:p>[\s\S]*?<\/a:p>/g)!) {
      expect(count(paragraph, '<a:pPr')).toBeLessThanOrEqual(1);
    }
    expect(slide).toContain('<a:buAutoNum type="arabicPeriod" startAt="3"/>');
  });

  it('places pictures for images and rasters, in model order', async () => {
    const read = await unzip((await writePptx(model, deps())).blob);
    const slide1 = read('ppt/slides/slide1.xml')!;
    const slide2 = read('ppt/slides/slide2.xml')!;

    // Folie 1: Hintergrundfoto + Icon; Folie 2: das nicht ladbare Bild gerastert, die veraltete Id fehlt.
    expect(count(slide1, '<p:pic>')).toBe(2);
    expect(count(slide2, '<p:pic>')).toBe(1);
    expect(names(slide1)).toEqual([
      'background-image',
      'shape-rect',
      'text-head',
      'pi-leaf',
      'text-list',
      'chart-1',
    ]);
    expect(names(slide2)).toEqual(['user-image-1']);
    expect(slide1).toContain('<a:srcRect');
    expect(slide1).toContain('<c:chart');
  });

  it('writes background, rotation, transparency and corner radius natively', async () => {
    const read = await unzip((await writePptx(model, deps())).blob);
    const slide1 = read('ppt/slides/slide1.xml')!;
    const slide2 = read('ppt/slides/slide2.xml')!;

    expect(slide1).toContain('<p:bg><p:bgPr><a:solidFill><a:srgbClr val="005538"');
    expect(slide2).not.toContain('<p:bg>');
    expect(slide1).toContain('rot="900000"');
    expect(slide1).toContain('<a:srgbClr val="8ABD24"><a:alpha val="50000"/>');
    expect(slide1).toContain('prst="roundRect"');
  });

  it('skips a raster that throws and keeps exporting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { skipped } = await writePptx(
      model,
      deps({
        rasterize: () => Promise.reject(new DOMException('tainted', 'SecurityError')),
      })
    );
    warn.mockRestore();
    expect(skipped).toEqual(['1:pi-leaf', '2:stale-id', '2:user-image-1']);
  });

  it('rasters a rotated chart instead of dropping its rotation', async () => {
    const rasterize = vi.fn(async (request: PptxRasterRequest) => ({
      dataUrl: PNG,
      box: request.box,
    }));
    const chart = model.slides[0]!.items.find((item) => item.kind === 'chart')!;
    await writePptx(
      {
        ...model,
        slides: [{ ...model.slides[0]!, items: [{ ...chart, rotation: 10 }] }],
      },
      deps({ rasterize })
    );
    expect(rasterize).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: 'chart-1', rotation: 10 }),
      0
    );
  });
});
