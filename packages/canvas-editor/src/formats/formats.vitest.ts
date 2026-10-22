import { canvasFormatIdSchema, PRINT_VARIANTEN, printSeitenOf } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  CANVAS_FORMAT_GROUP_ORDER,
  CANVAS_FORMATS,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  isPrintFormat,
  isSlideFormat,
  isUnsupportedFormatId,
  mmToPx,
  printGeometry,
  UnsupportedCanvasFormatError,
  type PrintCanvasFormat,
} from './index';

const print = (id: string): PrintCanvasFormat => {
  const format = getCanvasFormat(id);
  if (!format || !isPrintFormat(format)) throw new Error(`no print format ${id}`);
  return format;
};

describe('Format-Ids', () => {
  it('match the contract list the Vorlagen catalogue validates against', () => {
    expect(CANVAS_FORMATS.map((f) => f.id).sort()).toEqual(
      [...canvasFormatIdSchema.options].sort()
    );
  });

  it('give a print product as many pages as printSeitenOf (the Vorlagen previews)', () => {
    for (const f of CANVAS_FORMATS.filter(isPrintFormat)) {
      const varianten = Object.values(PRINT_VARIANTEN).filter((v) =>
        (v.formats as readonly string[]).includes(f.id)
      );
      for (const v of varianten) expect(printSeitenOf(v), f.id).toBe(f.print.seiten);
    }
  });

  // F0: die Ids stehen in gespeicherten Leinwänden. Umbenennen gibt es nicht.
  it('bleiben unverändert', () => {
    expect(CANVAS_FORMATS.map((f) => [f.id, f.category])).toEqual([
      ['post-portrait', 'digital'],
      ['post-portrait-tall', 'digital'],
      ['profile-square', 'digital'],
      ['slide-16-9', 'digital'],
      ['print-visitenkarte-quer', 'print'],
      ['print-visitenkarte-hoch', 'print'],
      ['print-a3-hoch', 'print'],
      ['print-a4-hoch', 'print'],
      ['print-a3-quer', 'print'],
      ['print-a1-hoch', 'print'],
      ['print-a1-quer', 'print'],
      ['print-grossflaeche', 'print'],
      ['print-citylight', 'print'],
      ['print-flyer-dinlang', 'print'],
      ['print-a6-hoch', 'print'],
      ['print-a6-quer', 'print'],
      ['print-briefbogen-a4', 'print'],
      ['print-zeitung-a4', 'print'],
    ]);
  });

  it('digitale Formate tragen kein Druckprofil', () => {
    for (const f of CANVAS_FORMATS.filter((f) => f.category === 'digital')) {
      expect(f.print, f.id).toBeNull();
    }
    for (const f of CANVAS_FORMATS.filter((f) => f.category === 'digital' && !isSlideFormat(f))) {
      expect(f.exportable).toEqual(['png', 'jpeg']);
      expect(f.defaultExport).toBe('png');
    }
  });

  it('Folienformat: 16:9, Gruppe Präsentation, PPTX als Standard', () => {
    const f = getCanvasFormat('slide-16-9');
    expect(f).toMatchObject({
      label: 'Präsentation',
      description: '1920 × 1080 · 16:9 · Folien',
      group: 'praesentation',
      category: 'digital',
      width: 1920,
      height: 1080,
      dpi: 72,
      iconKey: 'landscape',
      defaultExport: 'pptx',
      exportable: ['pptx', 'pdf', 'png'],
      print: null,
    });
  });

  it('isSlideFormat trifft nur das Folienformat', () => {
    expect(CANVAS_FORMATS.filter(isSlideFormat).map((f) => f.id)).toEqual(['slide-16-9']);
  });

  it('Print steht nicht in den Studio-Gruppen', () => {
    expect(CANVAS_FORMAT_GROUP_ORDER).toEqual([
      'sharepic',
      'sharepic-tall',
      'profilbild',
      'praesentation',
    ]);
  });
});

describe('Druckformate', () => {
  it.each([
    ['print-visitenkarte-quer', { w: 85, h: 55 }, 3, 2, 2000, 1341],
    ['print-visitenkarte-hoch', { w: 55, h: 85 }, 3, 2, 1341, 2000],
    ['print-a3-hoch', { w: 297, h: 420 }, 4, 1, 1423, 2000],
    ['print-a4-hoch', { w: 210, h: 297 }, 4, 1, 1426, 2000],
    ['print-a3-quer', { w: 420, h: 297 }, 4, 1, 2000, 1423],
    ['print-a1-hoch', { w: 594, h: 841 }, 10, 1, 1417, 2000, 150],
    ['print-a1-quer', { w: 841, h: 594 }, 10, 1, 2000, 1417, 150],
    ['print-grossflaeche', { w: 594, h: 420 }, 10, 1, 2000, 1420, 150],
    ['print-citylight', { w: 237, h: 350 }, 8, 1, 1365, 2000, 150],
    ['print-flyer-dinlang', { w: 297, h: 210 }, 4, 2, 2000, 1426, 300, 'erste-seite'],
    ['print-a6-hoch', { w: 105, h: 148 }, 3, 2, 1442, 2000, 300, 'letzte-seite'],
    ['print-a6-quer', { w: 148, h: 105 }, 3, 2, 2000, 1442, 300, 'letzte-seite'],
    ['print-briefbogen-a4', { w: 210, h: 297 }, 5, 2, 1426, 2000, 300, null],
    ['print-zeitung-a4', { w: 210, h: 297 }, 5, 4, 1426, 2000, 300, 'letzte-seite'],
  ] as const)('%s', (id, trimMm, safeMm, seiten, width, height, exportDpi = 300, impressum?) => {
    const f = print(id);
    expect(f.print).toEqual({
      trimMm,
      bleedMm: 3,
      safeMm,
      exportDpi,
      seiten,
      impressum: impressum === undefined ? (seiten === 1 ? 'jede-seite' : null) : impressum,
    });
    expect([f.width, f.height]).toEqual([width, height]);
    expect(f.dpi).toBe(exportDpi);
    expect(f.group).toBe('print');
    expect(f.exportable).toEqual(['pdf', 'png']);
    expect(f.defaultExport).toBe('pdf');
  });

  it('A3 hoch: lange Seite mit Beschnitt = 2000 px', () => {
    const f = print('print-a3-hoch');
    const pxPerMm = 2000 / (420 + 2 * 3);
    expect(mmToPx(f, 426)).toBeCloseTo(2000, 9);
    expect(mmToPx(f, 1)).toBeCloseTo(pxPerMm, 9);
    expect(f.width).toBe(Math.round(303 * pxPerMm));
  });

  it('printGeometry: Ursprung ist die äußere Beschnittkante', () => {
    const f = print('print-a3-hoch');
    const k = 2000 / 426;
    const g = printGeometry(f);
    expect(g.bleed).toEqual({ x: 0, y: 0, width: f.width, height: f.height });
    expect(g.trim.x).toBeCloseTo(3 * k, 9);
    expect(g.trim.y).toBeCloseTo(3 * k, 9);
    expect(g.trim.width).toBeCloseTo(297 * k, 9);
    expect(g.trim.height).toBeCloseTo(420 * k, 9);
    expect(g.safe.x).toBeCloseTo(7 * k, 9);
    expect(g.safe.y).toBeCloseTo(7 * k, 9);
    expect(g.safe.width).toBeCloseTo(289 * k, 9);
    expect(g.safe.height).toBeCloseTo(412 * k, 9);
  });

  it('printGeometry: Visitenkarte mit 3 mm Schutzzone', () => {
    const g = printGeometry(print('print-visitenkarte-quer'));
    const k = 2000 / 91;
    expect(g.safe.x).toBeCloseTo(6 * k, 9);
    expect(g.safe.width).toBeCloseTo(79 * k, 9);
    expect(g.safe.height).toBeCloseTo(49 * k, 9);
  });
});

describe('getCanvasFormatOrDefault', () => {
  it('fällt bei fehlender oder unbekannter digitaler Id auf 4:5 zurück', () => {
    expect(getCanvasFormatOrDefault(null).id).toBe('post-portrait');
    expect(getCanvasFormatOrDefault(undefined).id).toBe('post-portrait');
    expect(getCanvasFormatOrDefault('story').id).toBe('post-portrait');
  });

  it('löst bekannte Druckformate auf', () => {
    expect(getCanvasFormatOrDefault('print-a4-hoch').id).toBe('print-a4-hoch');
  });

  it('bildet ein unbekanntes Druckformat nicht still auf 4:5 ab', () => {
    expect(isUnsupportedFormatId('print-a5-quer')).toBe(true);
    expect(isUnsupportedFormatId('print-a3-hoch')).toBe(false);
    expect(isUnsupportedFormatId('story')).toBe(false);
    expect(isUnsupportedFormatId(null)).toBe(false);
    expect(() => getCanvasFormatOrDefault('print-a5-quer')).toThrow(UnsupportedCanvasFormatError);
  });
});
