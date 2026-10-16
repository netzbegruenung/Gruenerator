/**
 * Wo ein aus den Uploads gezogenes Bild landet. Die Seite ist doppelt skaliert:
 * die Bühne auf die Anzeigegröße (`displayScale`), darin eine Gruppe vom
 * Vorlagen-Bezugsraum auf das Format. Instanzen leben im Bezugsraum — ein Punkt
 * in Bühnenpixeln setzte das Bild um beide Faktoren daneben.
 */
import Konva from 'konva';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ELEMENT_DRAG_TYPE,
  MEDIA_DRAG_TYPE,
  isElementDrag,
  isMediaDrag,
  locateDrop,
  readElementDrag,
  readMediaDrag,
  type ElementDragPayload,
} from '../mediaDrop';

function transfer(data: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer;
}

describe('readMediaDrag', () => {
  it('liest eine Upload-Kachel', () => {
    const dt = transfer({
      [MEDIA_DRAG_TYPE]: JSON.stringify({ url: '/api/share/a/download', name: 'a.jpg' }),
    });
    expect(isMediaDrag(dt)).toBe(true);
    expect(readMediaDrag(dt)).toEqual({ url: '/api/share/a/download', name: 'a.jpg' });
  });

  it('nimmt keine blob:-Vorschau, die das Neuladen nicht überlebt', () => {
    const dt = transfer({ [MEDIA_DRAG_TYPE]: JSON.stringify({ url: 'blob:x', name: 'a' }) });
    expect(readMediaDrag(dt)).toBeNull();
  });

  it('ignoriert fremde Drags und kaputte Daten', () => {
    expect(isMediaDrag(transfer({ Files: '' }))).toBe(false);
    expect(readMediaDrag(transfer({ [MEDIA_DRAG_TYPE]: '{kaputt' }))).toBeNull();
    expect(readMediaDrag(null)).toBeNull();
  });

  it('trägt die Bildrechte eines Stockfotos mit', () => {
    const media = {
      url: 'https://images.unsplash.com/photo-1',
      name: 'wald',
      attribution: {
        photographer: 'Ada',
        profileUrl: 'https://unsplash.com/@ada',
        photoUrl: 'https://unsplash.com/photos/1',
      },
    };
    const dt = transfer({ [MEDIA_DRAG_TYPE]: JSON.stringify(media) });
    expect(readMediaDrag(dt)).toEqual(media);
  });

  it('liest eine Upload-Kachel von vor den Elementen weiter (ohne kind)', () => {
    const dt = transfer({
      [MEDIA_DRAG_TYPE]: JSON.stringify({ url: '/api/share/a/download', name: 'a.jpg' }),
    });
    expect(readElementDrag(dt)).toBeNull();
    expect(readMediaDrag(dt)).toEqual({ url: '/api/share/a/download', name: 'a.jpg' });
  });
});

describe('readElementDrag', () => {
  const payloads: ElementDragPayload[] = [
    { kind: 'asset', assetId: 'sonnenblume-gelb' },
    { kind: 'sticker', ref: { id: 'sticker-1', src: '/stickers/1.png' } },
    { kind: 'shape', shapeType: 'rect', color: '#ff0000' },
    { kind: 'illustration', id: 'undraw-1' },
    { kind: 'chart', chartType: 'bar' },
    { kind: 'frame', clipType: 'circle' },
    { kind: 'balken', mode: 'triple' },
  ];

  it.each(payloads)('liest eine $kind-Kachel', (payload) => {
    const dt = transfer({ [ELEMENT_DRAG_TYPE]: JSON.stringify(payload) });
    expect(isElementDrag(dt)).toBe(true);
    expect(isMediaDrag(dt)).toBe(false);
    expect(readElementDrag(dt)).toEqual(payload);
  });

  it('verwirft unbekannte Arten und kaputte Daten', () => {
    expect(
      readElementDrag(transfer({ [ELEMENT_DRAG_TYPE]: JSON.stringify({ kind: 'video' }) }))
    ).toBeNull();
    expect(readElementDrag(transfer({ [ELEMENT_DRAG_TYPE]: JSON.stringify({}) }))).toBeNull();
    expect(readElementDrag(transfer({ [ELEMENT_DRAG_TYPE]: '{kaputt' }))).toBeNull();
    expect(readElementDrag(null)).toBeNull();
    expect(isElementDrag(transfer({ Files: '' }))).toBe(false);
  });
});

describe('locateDrop', () => {
  let stage: Konva.Stage | null = null;
  afterEach(() => {
    stage?.destroy();
    stage = null;
  });

  /** 200×250 angezeigt, Format 800×1000, Vorlage 400×500 (Gruppe ×2, Bühne ×0,25). */
  function page() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    stage = new Konva.Stage({ container, width: 200, height: 250, scaleX: 0.25, scaleY: 0.25 });
    const layer = new Konva.Layer();
    const logical = new Konva.Group({ scaleX: 2, scaleY: 2 });
    const frame = new Konva.Group({ name: 'frame-f1', x: 100, y: 100 });
    frame.add(new Konva.Rect({ width: 50, height: 50, fill: '#000' }));
    logical.add(frame);
    layer.add(logical);
    stage.add(layer);
    layer.draw();
    return stage;
  }

  it('rechnet den Punkt in den Bezugsraum der Vorlage um', () => {
    expect(locateDrop(page(), { clientX: 30, clientY: 40 }, 2)).toEqual({
      point: { x: 60, y: 80 },
      frameId: null,
    });
  });

  it('erkennt den Rahmen unter dem Zeiger', () => {
    // Rahmen bei Bezug 100..150 → Bühnenpixel 50..75 (×2 ×0,25).
    expect(locateDrop(page(), { clientX: 60, clientY: 65 }, 2)).toEqual({
      point: { x: 120, y: 130 },
      frameId: 'f1',
    });
  });
});
