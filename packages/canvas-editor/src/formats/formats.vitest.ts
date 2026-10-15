import { describe, expect, it } from 'vitest';

import {
  CANVAS_FORMAT_GROUP_ORDER,
  CANVAS_FORMATS,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  isPrintFormat,
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
  // F0: die Ids stehen in gespeicherten Leinwänden. Umbenennen gibt es nicht.
  it('bleiben unverändert', () => {
    expect(CANVAS_FORMATS.map((f) => [f.id, f.category])).toEqual([
      ['post-portrait', 'digital'],
      ['post-portrait-tall', 'digital'],
      ['profile-square', 'digital'],
      ['print-visitenkarte-quer', 'print'],
      ['print-visitenkarte-hoch', 'print'],
      ['print-a3-hoch', 'print'],
      ['print-a4-hoch', 'print'],
    ]);
  });

  it('digitale Formate tragen kein Druckprofil', () => {
    for (const f of CANVAS_FORMATS.filter((f) => f.category === 'digital')) {
      expect(f.print, f.id).toBeNull();
      expect(f.exportable).toEqual(['png', 'jpeg']);
      expect(f.defaultExport).toBe('png');
    }
  });

  it('Print steht nicht in den Studio-Gruppen', () => {
    expect(CANVAS_FORMAT_GROUP_ORDER).toEqual(['sharepic', 'sharepic-tall', 'profilbild']);
  });
});

describe('Druckformate', () => {
  it.each([
    ['print-visitenkarte-quer', { w: 85, h: 55 }, 3, 2, 2000, 1341],
    ['print-visitenkarte-hoch', { w: 55, h: 85 }, 3, 2, 1341, 2000],
    ['print-a3-hoch', { w: 297, h: 420 }, 4, 1, 1423, 2000],
    ['print-a4-hoch', { w: 210, h: 297 }, 4, 1, 1426, 2000],
  ])('%s', (id, trimMm, safeMm, seiten, width, height) => {
    const f = print(id);
    expect(f.print).toEqual({ trimMm, bleedMm: 3, safeMm, exportDpi: 300, seiten });
    expect([f.width, f.height]).toEqual([width, height]);
    expect(f.dpi).toBe(300);
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
